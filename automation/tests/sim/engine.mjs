// A small interpreter for the exported ROOFORA workflow JSON.
// It runs the REAL generated Code-node scripts and the REAL node wiring against
// the fake services in services.mjs. It is a SIMULATION: it does not prove n8n
// itself behaves the same (item pairing, sandbox limits, credentials, timing).

import { createHash } from 'node:crypto';
import { NetworkError } from './services.mjs';

export function createClock(startIso) {
  let ms = Date.parse(startIso);
  return {
    get ms() { return ms; },
    set(iso) { ms = Date.parse(iso); },
    advance(minutes) { ms += minutes * 60000; },
    iso: () => new Date(ms).toISOString(),
  };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function createEngine({ workflows, ids, services, clock, onNode }) {
  // workflows: { leadManager, sendEmail, errorHandler } as parsed JSON; ids maps those keys to fake workflow IDs
  const byId = new Map(Object.entries(ids).map(([key, id]) => [id, workflows[key]]));
  const staticData = new Map();
  const executions = [];
  let execSeq = 0;
  const log = { telegram: services.telegram.messages, waits: [], pendingWaits: [], problems: [] };

  class FDate extends Date {
    constructor(...a) { if (a.length === 0) super(clock.ms); else super(...a); }
    static now() { return clock.ms; }
  }

  const stringify = (v) => JSON.stringify(v);

  function evalExpr(expr, scope) {
    if (typeof expr !== 'string' || !expr.startsWith('=')) return expr;
    const body = expr.replace(/^=\s*/, '').replace(/^\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
    if (body.includes('{{')) throw new Error('Mixed template expressions are not supported by the simulator: ' + expr.slice(0, 80));
    return new Function('$json', '$', '$execution', 'JSON', 'Date', 'encodeURIComponent', 'Intl', 'Buffer', '"use strict"; return (' + body + ');')(
      scope.$json, scope.$, scope.$execution, JSON, FDate, encodeURIComponent, Intl, Buffer
    );
  }

  function nodeRefFactory(run) {
    return (name) => {
      const runs = run.runData[name];
      const lastOut = () => {
        if (!runs || !runs.length) throw new Error("Node '" + name + "' hasn't been executed");
        const last = runs[runs.length - 1];
        const firstNonEmpty = last.outputs.find((o) => o && o.length) || [];
        return firstNonEmpty;
      };
      return {
        get isExecuted() { return Boolean(runs && runs.length); },
        first: () => lastOut()[0],
        last: () => { const o = lastOut(); return o[o.length - 1]; },
        all: () => lastOut(),
      };
    };
  }

  async function runWorkflow(wf, wfId, trigger, items, opts = {}) {
    const run = { id: String(++execSeq), wf, wfId, runData: {}, response: null, lastNode: null, errors: [] };
    executions.push(run);
    const $execution = { id: run.id, mode: 'production' };
    const nodes = new Map(wf.nodes.map((n) => [n.name, n]));
    const stack = [{ name: trigger, items }];
    for (const [seedName, seedItems] of Object.entries(opts.seed || {})) run.runData[seedName] = [{ outputs: [seedItems], input: seedItems }];
    const staticKey = wfId;

    try {
      while (stack.length) {
        const { name, items: input } = stack.pop();
        const node = nodes.get(name);
        if (!node) throw new Error('Unknown node ' + name);
        if (node.type === 'n8n-nodes-base.stickyNote') continue;
        const outputs = await runNode(node, node.executeOnce ? input.slice(0, 1) : input);
        run.runData[name] = run.runData[name] || [];
        run.runData[name].push({ outputs, input });
        run.lastNode = name;
        if (onNode) onNode(wf.name, name, input, outputs);
        const conns = (wf.connections[name] && wf.connections[name].main) || [];
        // depth-first, first connection first: push in reverse
        for (let o = conns.length - 1; o >= 0; o--) {
          const out = outputs[o];
          if (!out || !out.length) continue;
          for (let c = conns[o].length - 1; c >= 0; c--) stack.push({ name: conns[o][c].node, items: out });
        }
      }
    } catch (err) {
      run.error = err;
      run.errors.push(err);
      const handler = wf.settings && wf.settings.errorWorkflow;
      if (handler && byId.has(handler) && !opts.isErrorRun) {
        await runWorkflow(byId.get(handler), handler, 'ROOFORA Workflow Failed', [{ json: { execution: { id: run.id, error: { message: err.message, node: { name: err.nodeName || run.lastNode || '' } }, lastNodeExecuted: err.nodeName || run.lastNode }, workflow: { id: wfId, name: wf.name } } }], { isErrorRun: true });
      }
      if (opts.rethrow) throw err;
    }
    return run;

    async function runNode(node, input) {
      const $ = nodeRefFactory(run);
      const scopeFor = (item) => ({ $json: item.json, $, $execution });
      try {
        switch (node.type) {
          case 'n8n-nodes-base.manualTrigger':
          case 'n8n-nodes-base.webhook':
          case 'n8n-nodes-base.errorTrigger':
          case 'n8n-nodes-base.executeWorkflowTrigger':
          case 'n8n-nodes-base.scheduleTrigger':
          case 'n8n-nodes-base.gmailTrigger':
            return [input];
          case 'n8n-nodes-base.code': {
            const $input = { first: () => input[0], last: () => input[input.length - 1], all: () => input, item: input[0] };
            const sd = () => { if (!staticData.has(staticKey)) staticData.set(staticKey, {}); return staticData.get(staticKey); };
            const fn = new Function('$input', '$', '$execution', '$getWorkflowStaticData', 'Buffer', 'Date', 'Intl', node.parameters.jsCode);
            const out = fn($input, $, $execution, sd, Buffer, FDate, Intl);
            if (!Array.isArray(out) || out.some((x) => !x || typeof x.json !== 'object')) throw new Error('Code node must return an array of {json} items');
            return [out];
          }
          case 'n8n-nodes-base.if': {
            const t = [], f = [];
            for (const item of input) {
              const cond = node.parameters.conditions.conditions[0];
              const v = evalExpr(cond.leftValue, scopeFor(item));
              (v === true || v === 'true' || (cond.operator.operation === 'true' && Boolean(v)) ? t : f).push(item);
            }
            return [t, f];
          }
          case 'n8n-nodes-base.switch': {
            const outs = Array.from({ length: node.parameters.numberOutputs }, () => []);
            for (const item of input) {
              const idx = evalExpr(node.parameters.output, scopeFor(item));
              if (Number.isInteger(idx) && outs[idx]) outs[idx].push(item);
            }
            return outs;
          }
          case 'n8n-nodes-base.httpRequest': {
            const out = [];
            const kinds = Object.keys(node.credentials || {});
            for (const item of input) {
              const sc = scopeFor(item);
              const method = evalExpr(node.parameters.method, sc) || 'GET';
              const url = evalExpr(node.parameters.url, sc);
              let body;
              if (node.parameters.sendBody) {
                const raw = evalExpr(node.parameters.jsonBody, sc);
                body = typeof raw === 'string' ? JSON.parse(raw) : raw;
              }
              try {
                const res = await services.http({ method, url, body, credentialsKinds: kinds });
                out.push({ json: res });
              } catch (e) {
                if (!(e instanceof NetworkError)) throw e;
                if (node.onError !== 'continueRegularOutput') throw Object.assign(e, { nodeName: node.name });
                out.push({ json: { error: e.message } });
              }
            }
            return [out];
          }
          case 'n8n-nodes-base.respondToWebhook': {
            const item = input[0];
            const sc = scopeFor(item);
            const status = Number(evalExpr(node.parameters.options.responseCode, sc) || 200);
            const body = evalExpr(node.parameters.responseBody, sc);
            if (!run.response) run.response = { status, body: node.parameters.respondWith === 'json' ? JSON.parse(body) : body, by: node.name };
            return [input];
          }
          case 'n8n-nodes-base.crypto': {
            return [input.map((item) => {
              const p = node.parameters;
              const v = p.action === 'generate' ? [...Array(p.stringLength)].map(() => Math.floor(Math.random() * 16).toString(16)).join('') : createHash('sha256').update(String(evalExpr(p.value, scopeFor(item)))).digest('hex');
              return { json: { ...item.json, [p.dataPropertyName]: v } };
            })];
          }
          case 'n8n-nodes-base.wait': {
            const until = node.parameters.resume === 'specificTime' ? evalExpr(node.parameters.dateTime, scopeFor(input[0])) : null;
            log.waits.push({ node: node.name, until: until || 'interval', wf: wf.name });
            // A wait for a future time pauses the execution (n8n stores it in its database); a short interval passes through.
            if (until && Date.parse(until) > clock.ms) { log.pendingWaits.push({ wf: wf.name, node: node.name, until, items: input }); return [[]]; }
            return [input];
          }
          case 'n8n-nodes-base.telegram': {
            const out = [];
            for (const item of input) {
              const sc = scopeFor(item);
              const msg = { chatId: node.parameters.chatId, text: evalExpr(node.parameters.text, sc), at: clock.iso(), wf: wf.name };
              if (services.telegram.mode === 'fail') {
                if (node.onError !== 'continueRegularOutput') throw new Error('Telegram failed');
                out.push({ json: { error: 'Telegram failed' } });
                continue;
              }
              services.telegram.messages.push(msg);
              out.push(item);
            }
            return [out];
          }
          case 'n8n-nodes-base.executeWorkflow': {
            const subId = node.parameters.workflowId.value;
            const sub = byId.get(subId);
            if (!sub) throw new Error('Execute Workflow points at an unknown workflow id: ' + subId);
            const out = [];
            for (const item of input) {
              try {
                const subRun = await runWorkflow(sub, subId, sub.nodes.find((n) => n.type === 'n8n-nodes-base.executeWorkflowTrigger').name, [item], { rethrow: node.parameters.options.waitForSubWorkflow });
                if (subRun.error && node.parameters.options.waitForSubWorkflow) throw subRun.error;
                const last = subRun.runData[subRun.lastNode];
                const lastOut = last ? last[last.length - 1].outputs.find((o) => o && o.length) || [] : [];
                out.push(...(node.parameters.options.waitForSubWorkflow ? lastOut : [item]));
              } catch (e) {
                if (node.onError !== 'continueRegularOutput') throw e;
                out.push({ json: { error: e.message } });
              }
            }
            return [out];
          }
          default:
            throw new Error('Simulator does not support node type ' + node.type);
        }
      } catch (e) {
        if (!e.nodeName) e.nodeName = node.name;
        throw e;
      }
    }
  }

  const entry = (key) => workflows[key];
  return {
    log, executions,
    /** Posts to a webhook node of the lead manager and returns { response, run }. */
    async webhook(nodeName, { body = {}, query = {}, headers = {} } = {}) {
      const run = await runWorkflow(entry('leadManager'), ids.leadManager, nodeName, [{ json: { headers, query, body } }]);
      return { response: run.response, run };
    },
    async trigger(nodeName, items = [{ json: {} }]) {
      return runWorkflow(entry('leadManager'), ids.leadManager, nodeName, items);
    },
    /** Continues a paused wait: starts at the node, with earlier nodes' outputs seeded. */
    async resume(nodeName, items, seed = {}) {
      return runWorkflow(entry('leadManager'), ids.leadManager, nodeName, items, { seed });
    },
    /** Runs any workflow by key (e.g. 'airtableSetup') from a named trigger. */
    async run(key, nodeName, items = [{ json: {} }]) {
      return runWorkflow(entry(key), ids[key], nodeName, items);
    },
    async callSendEmail(payload) {
      return runWorkflow(entry('sendEmail'), ids.sendEmail, 'Email Requested', [{ json: payload }]);
    },
    async reportProblem(payload) {
      return runWorkflow(entry('errorHandler'), ids.errorHandler, 'Problem Reported', [{ json: payload }]);
    },
    async crash(message, stepName) {
      return runWorkflow(entry('errorHandler'), ids.errorHandler, 'ROOFORA Workflow Failed', [{ json: { execution: { id: 'x1', error: { message, node: { name: stepName } } }, workflow: { name: 'ROOFORA — Lead Manager' } } }]);
    },
  };
}
