// Shared helpers for the controlled live tests. Reads secrets from .env.local / the git-ignored config and
// NEVER prints them. Every network call goes to https://n8n.walkflow.tech (the user's own instance).

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = join(ROOT, '..');

export function loadEnv() {
  const out = {};
  for (const line of readFileSync(join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
export const env = loadEnv();
export const cfgPath = join(ROOT, 'config', 'roofora.config.local.json');
export const loadCfg = () => JSON.parse(readFileSync(cfgPath, 'utf8'));
export const base = env.N8N_API_URL.replace(/\/+$/, '');

export async function n8n(method, path, body) {
  const res = await fetch(base + '/api/v1' + path, { method, headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* leave null */ }
  if (!res.ok) throw new Error(method + ' ' + path + ' → HTTP ' + res.status + (data && data.message ? ': ' + data.message : ''));
  return data;
}

export async function findWorkflow(name) {
  const list = await n8n('GET', '/workflows?limit=250');
  const hits = list.data.filter((w) => w.name === name);
  if (hits.length > 1) throw new Error('More than one workflow named ' + name);
  return hits[0] || null;
}
export const activate = (id) => n8n('POST', '/workflows/' + id + '/activate');
export const deactivate = (id) => n8n('POST', '/workflows/' + id + '/deactivate');

/** Calls a production webhook of the ROOFORA workflows with the website secret. */
export async function webhook(path, body, { method = 'POST', basic = false, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (basic) h.Authorization = 'Basic ' + Buffer.from(env.ROOFORA_STAFF_USER + ':' + env.ROOFORA_STAFF_PASSWORD).toString('base64');
  else h['X-Roofora-Secret'] = env.N8N_ROOFORA_WEBHOOK_SECRET;
  const res = await fetch(base + '/webhook/' + path, { method, headers: h, body: body === undefined || method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const text = await res.text();
  let data = text; try { data = JSON.parse(text); } catch { /* html or text */ }
  return { status: res.status, data };
}

export async function harness(service, method, url, body) {
  const r = await webhook('roofora/harness', { service, method, url, body });
  if (r.status !== 200) throw new Error('harness HTTP ' + r.status + ' ' + JSON.stringify(r.data).slice(0, 200));
  return r.data; // { statusCode, body, error }
}

export const at = (cfg) => `https://api.airtable.com/v0/${cfg.airtableBaseId}/`;
export const atList = async (cfg, table, params = '') => (await harness('airtable', 'GET', at(cfg) + encodeURIComponent(table) + (params ? '?' + params : ''))).body.records || [];
export const atPatch = (cfg, table, id, fields) => harness('airtable', 'PATCH', at(cfg) + encodeURIComponent(table), { typecast: true, records: [{ id, fields }] });
export const atCreate = (cfg, table, fields) => harness('airtable', 'POST', at(cfg) + encodeURIComponent(table), { typecast: true, records: [{ fields }] });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Latest executions of a workflow (ids + status + times only — never data). */
export async function recentExecutions(workflowId, limit = 10) {
  const r = await n8n('GET', `/executions?workflowId=${workflowId}&limit=${limit}`);
  return (r.data || []).map((e) => ({ id: e.id, status: e.status, mode: e.mode, startedAt: e.startedAt, stoppedAt: e.stoppedAt }));
}

const EVIDENCE = join(ROOT, 'docs', 'LIVE-TEST-EVIDENCE.md');
// Evidence lines are committed documentation: never let real credential ids, addresses or the base id into them.
function scrub(line) {
  let out = String(line);
  try {
    const c = loadCfg();
    for (const v of Object.values(c.credentials || {})) if (v && v.id) out = out.split(v.id).join('<credential>');
    for (const e of [c.settingsSeed && c.settingsSeed['Test Recipient Email'], c.settingsSeed && c.settingsSeed['Sender Email']]) if (e) out = out.split(e).join('<address>');
    if (c.airtableBaseId) out = out.split(c.airtableBaseId).join('<base>');
    if (c.telegramChatId) out = out.split(String(c.telegramChatId)).join('<chat>');
  } catch { /* config missing: nothing to scrub */ }
  return out;
}
export function evidence(rawLine) {
  const line = scrub(rawLine);
  if (!existsSync(EVIDENCE)) { mkdirSync(dirname(EVIDENCE), { recursive: true }); appendFileSync(EVIDENCE, '# Live test evidence (real n8n.walkflow.tech / Airtable / Gmail / Calendar / Telegram)\n\nGenerated by automation/scripts/live-*.mjs. Contains ids and statuses only — no secrets, no message bodies.\n\n'); }
  appendFileSync(EVIDENCE, line + '\n');
  console.log(line);
}
