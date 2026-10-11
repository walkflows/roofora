// Tests the import script against a FAKE n8n API (not your real n8n).
//   node automation/tests/deploy.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { deploy, discoverCredentials } from '../scripts/deploy-n8n.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'roofora.config.example.json'), 'utf8'));

function fakeN8n(seed = []) {
  const store = new Map(seed.map((w) => [w.id, w]));
  const calls = [];
  let n = 0;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    calls.push({ method: req.method, path: req.url, key: req.headers['x-n8n-api-key'] });
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.headers['x-n8n-api-key'] !== 'test-key') return send(401, { message: 'unauthorized' });
    if (req.method === 'GET' && req.url.startsWith('/api/v1/workflows?')) return send(200, { data: [...store.values()].map(({ id, name, active, nodes }) => ({ id, name, active, nodes })), nextCursor: null });
    const one = /^\/api\/v1\/workflows\/(\w+)$/.exec(req.url);
    if (req.method === 'GET' && one && store.has(one[1])) return send(200, store.get(one[1]));
    if (req.method === 'POST' && req.url === '/api/v1/workflows') { const b = JSON.parse(raw); const w = { id: 'wf' + ++n, active: false, ...b }; store.set(w.id, w); return send(200, w); }
    const m = /^\/api\/v1\/workflows\/(\w+)$/.exec(req.url);
    if (req.method === 'PUT' && m && store.has(m[1])) { const w = { ...store.get(m[1]), ...JSON.parse(raw) }; store.set(m[1], w); return send(200, w); }
    send(404, { message: 'nope' });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, store, calls, url: 'http://localhost:' + server.address().port })));
}

const results = [];
async function scenario(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e }); } }
const quiet = () => {};

await scenario('D1 dry run changes nothing and reports what it would create', async () => {
  const f = await fakeN8n([{ id: 'other1', name: 'WALKFLOW BUSINESS — Manager', active: true }]);
  const { report } = await deploy({ apply: false, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  assert.deepEqual(report.map((r) => r.action), ['would create', 'would create', 'would create', 'would create']);
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, 0); assert.equal(f.store.size, 1);
  f.server.close();
});
await scenario('D2 apply creates 4 inactive workflows, links them by real IDs, leaves other projects alone', async () => {
  const other = { id: 'other1', name: 'WALKFLOW BUSINESS — Manager', active: true, nodes: [{ name: 'x' }] };
  const f = await fakeN8n([other]);
  const { ids } = await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  const created = [...f.store.values()].filter((w) => w.name.startsWith('ROOFORA — '));
  assert.equal(created.length, 4); assert.ok(created.every((w) => w.active === false));
  assert.deepEqual(f.store.get('other1'), other, 'unrelated workflow untouched');
  const main = f.store.get(ids.leadManager);
  const refs = main.nodes.filter((n) => n.type === 'n8n-nodes-base.executeWorkflow').map((n) => n.parameters.workflowId.value);
  assert.ok(refs.length > 5 && refs.every((r) => r === ids.sendEmail || r === ids.errorHandler), 'sub-workflow calls point at the real IDs');
  assert.equal(main.settings.errorWorkflow, ids.errorHandler);
  assert.equal(f.store.get(ids.sendEmail).settings.errorWorkflow, ids.errorHandler);
  assert.ok(f.calls.every((c) => c.key === 'test-key'));
  assert.ok(!f.calls.some((c) => c.method === 'DELETE' || /activate/.test(c.path)));
  f.server.close();
});
await scenario('D3 re-running updates the same workflows instead of duplicating; an ACTIVE workflow is skipped', async () => {
  const f = await fakeN8n();
  await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  const before = f.store.size;
  const { report } = await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  assert.equal(f.store.size, before); assert.ok(report.every((r) => r.action === 'updated'));
  const main = [...f.store.values()].find((w) => w.name === 'ROOFORA — Lead Manager'); main.active = true;
  const r3 = await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  assert.equal(r3.report.find((r) => r.key === 'leadManager').action, 'skipped (active)');
  f.server.close();
});
await scenario('D4 wrong API key stops with a clear error and writes nothing', async () => {
  const f = await fakeN8n();
  await assert.rejects(deploy({ apply: true, apiUrl: f.url, apiKey: 'wrong', cfg, log: quiet }), /HTTP 401/);
  assert.equal(f.store.size, 0);
  f.server.close();
});

await scenario('D5 an existing ROOFORA workflow is backed up BEFORE it is replaced; a dry run backs up nothing', async () => {
  const f = await fakeN8n();
  await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet });
  const before = JSON.stringify([...f.store.values()].find((w) => w.name === 'ROOFORA — Error Handler'));
  const saved = [];
  await deploy({ apply: false, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet, backup: (n, id, json) => saved.push([n, id, json]) });
  assert.equal(saved.length, 0);
  await deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet, backup: (n, id, json) => saved.push([n, id, json]) });
  assert.equal(saved.length, 4);
  assert.equal(JSON.stringify(saved.find((x) => x[0] === 'ROOFORA — Error Handler')[2]), before, 'backup holds the version that was live before the update');
  f.server.close();
});
await scenario('D6 two workflows with the same ROOFORA name: refuses to guess and writes nothing', async () => {
  const f = await fakeN8n([{ id: 'a1', name: 'ROOFORA — Lead Manager', active: false, nodes: [] }, { id: 'a2', name: 'ROOFORA — Lead Manager', active: false, nodes: [] }]);
  await assert.rejects(deploy({ apply: true, apiUrl: f.url, apiKey: 'test-key', cfg, log: quiet }), /same ROOFORA name/);
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, 0);
  f.server.close();
});
await scenario('D7 credential discovery is read-only and returns only ids and names', async () => {
  const f = await fakeN8n([
    { id: 'w1', name: 'Some other project', active: true, nodes: [{ name: 'n', credentials: { airtableTokenApi: { id: 'AT123', name: 'Airtable account' }, slackApi: { id: 'S1', name: 'ignored' } }, parameters: { secret: 'must-not-appear' } }] },
    { id: 'w2', name: 'Another', active: false, nodes: [{ name: 'g', credentials: { gmailOAuth2: { id: 'GM9', name: 'Gmail account' } } }] },
  ]);
  const list = await discoverCredentials({ apiUrl: f.url, apiKey: 'test-key' });
  assert.deepEqual(list.map((c) => c.type + ':' + c.id + ':' + c.name), ['airtableTokenApi:AT123:Airtable account', 'gmailOAuth2:GM9:Gmail account']);
  assert.ok(!JSON.stringify(list).includes('must-not-appear'));
  assert.equal(f.calls.filter((c) => c.method !== 'GET').length, 0); assert.equal(f.store.size, 2);
  f.server.close();
});

let failed = 0;
for (const r of results) {
  if (r.ok) console.log('PASS  ' + r.name);
  else { failed++; console.log('FAIL  ' + r.name + '\n        ' + String(r.err && (r.err.stack || r.err.message) || r.err).split('\n').slice(0, 6).join('\n        ')); }
}
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed (fake n8n API)');
process.exit(failed ? 1 : 0);
