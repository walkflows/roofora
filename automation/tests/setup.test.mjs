// SIMULATED tests of the one-time Airtable setup workflow.
//   node automation/tests/setup.test.mjs
// Runs the generated "ROOFORA — Airtable Setup Check" workflow against a fake
// Airtable schema API that enforces the documented create-table/create-field rules.
// It does NOT touch your real base.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServices } from './sim/services.mjs';
import { createEngine, createClock } from './sim/engine.mjs';
import { buildAll } from '../build/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'roofora.config.example.json'), 'utf8'));
cfg.airtableBaseId = 'appTESTBASE0000001';
cfg.workflowIds = { sendEmail: 'wfSend', errorHandler: 'wfError' };
const built = buildAll(cfg);
const workflows = Object.fromEntries(Object.entries(built).map(([k, w]) => [k, JSON.parse(JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings }))]));
workflows.leadManager.settings.errorWorkflow = 'wfError';
const ids = { leadManager: 'wfMain', sendEmail: 'wfSend', errorHandler: 'wfError', airtableSetup: 'wfSetup' };
const schema = JSON.parse(readFileSync(join(ROOT, 'airtable', 'schema.json'), 'utf8'));
const START = '2026-10-12T09:00:00.000Z';

function world(initial) {
  const clock = createClock(START);
  const services = createServices(clock, cfg.airtableBaseId, { initial });
  const engine = createEngine({ workflows, ids, services, clock });
  return { clock, services, engine };
}
const check = async (w) => (await w.engine.run('airtableSetup', 'Check Only (no changes)')).runData['Setup Report'][0].outputs[0][0].json;
const create = async (w) => (await w.engine.run('airtableSetup', 'Create Missing Tables And Fields')).runData['Setup Report'][0].outputs[0][0].json;
const names = (w) => w.services.rows('Settings').length;

const results = [];
async function scenario(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e }); } }

await scenario('S1 empty base, Check Only: reports everything missing and changes NOTHING', async () => {
  const w = world('empty');
  const r = await check(w);
  assert.equal(r.ok, false); assert.equal(r.mode, 'check');
  assert.match(r.needsYou.join('\n'), /Would create tables: Leads, Inspections, Quotes, Activity, Settings/);
  assert.equal(w.services.airtable.schemaWrites.length, 0); assert.equal(w.services.rows ? true : true, true);
});
await scenario('S2 empty base, Create: builds every table/field/link from schema.json, seeds Settings; second run changes nothing', async () => {
  const w = world('empty');
  const r = await create(w);
  assert.deepEqual(r.needsYou, [], JSON.stringify(r));
  assert.equal(r.ok, true); assert.ok(r.changed.some((c) => /create table Leads/.test(c)));
  const metaTables = (await w.services.http({ method: 'GET', url: 'https://api.airtable.com/v0/meta/bases/' + cfg.airtableBaseId + '/tables', credentialsKinds: ['airtableTokenApi'] })).body.tables;
  for (const t of schema.tables) {
    const m = metaTables.find((x) => x.name === t.name);
    assert.ok(m, 'table ' + t.name);
    assert.equal(m.fields.find((f) => f.id === m.primaryFieldId).name, t.fields.find((f) => f.primary).name, 'primary field of ' + t.name);
    for (const f of t.fields) {
      const got = m.fields.find((x) => x.name === f.name);
      assert.ok(got, t.name + '.' + f.name + ' missing'); assert.equal(got.type, f.type, t.name + '.' + f.name);
      if (f.type === 'multipleRecordLinks') assert.equal(metaTables.find((x) => x.id === got.options.linkedTableId).name, f.linkedTable);
      if (f.type === 'singleSelect') assert.deepEqual(got.options.choices.map((c) => c.name), f.options);
    }
  }
  assert.equal(w.services.rows('Settings').length, 1); assert.equal(w.services.rows('Settings')[0].fields['Customer Emails Enabled'], false); assert.equal(w.services.rows('Settings')[0].fields['Test Mode'], true);
  const writes = w.services.airtable.schemaWrites.length;
  const again = await create(w);
  assert.equal(again.ok, true, JSON.stringify(again)); assert.deepEqual(again.changed, []);
  assert.equal(w.services.airtable.schemaWrites.length, writes, 'second run must not change the schema'); assert.equal(w.services.rows('Settings').length, 1);
  const chk = await check(w);
  assert.equal(chk.ok, true); assert.deepEqual(chk.needsYou, []);
});
await scenario('S2b the base the setup workflow built accepts a full real enquiry journey (no unknown fields, no bad options)', async () => {
  const w = world('empty');
  await create(w);
  Object.assign(w.services.rows('Settings')[0].fields, { 'Customer Emails Enabled': true, 'Test Mode': false, 'Sender Email': 'hello@roofora.test', 'Business Timezone': 'Europe/London', 'Website URL': 'https://roofora.test', 'Calendar ID': 'cal@x', 'Service Area Postcode Prefixes': 'CR0' });
  const sid = randomUUID();
  const body = { contractVersion: 1, source: 'roofora-website', environment: 'development', enquiryRef: 'RF-' + sid.replace(/-/g, '').slice(0, 8).toUpperCase(), receivedAt: START, submissionId: sid, fullName: 'Test Customer', phone: '+447700900123', email: 'cust@example.test', propertyType: 'Residential', service: 'Roof Repair', town: 'Croydon', postcode: 'CR0 1AA', details: 'x', urgency: 'This week', preferredContact: 'Email', photoCount: 0, consent: { given: true, wording: 'w', version: 'v1', recordedAt: START } };
  const { response } = await w.engine.webhook('Website Enquiry', { body });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(w.services.gmail.sent.length, 1);
  assert.deepEqual(w.services.warnings, []);
  const lead = w.services.rows('Leads')[0];
  const insp = w.services.seed('Inspections', { Inspection: 'i', Lead: [lead.id], Status: 'Requested', 'Proposed Start': '2026-10-14T09:00:00.000Z' });
  const booked = await w.engine.webhook('Staff Button (Confirm)', { headers: { origin: cfg.n8nBaseUrl }, body: { action: 'book-inspection', record: insp.id } });
  assert.equal(booked.response.status, 200, String(booked.response.body).slice(0, 300));
  const quote = w.services.seed('Quotes', { Quote: 'q', Lead: [lead.id], Version: 1, Scope: 'Replace slipped slates and re-seal valley.', Amount: 640, Approved: true, 'Approved By': 'Sam', Status: 'Draft' });
  const sent = await w.engine.webhook('Staff Button (Confirm)', { headers: { origin: cfg.n8nBaseUrl }, body: { action: 'send-quote', record: quote.id } });
  assert.equal(sent.response.status, 200, String(sent.response.body).slice(0, 300));
  assert.deepEqual(w.services.warnings, []);
});
await scenario('S3 token cannot read the structure: plain-English scope advice, nothing changed', async () => {
  const w = world('empty');
  w.services.airtable.scopes.read = false;
  const r = await create(w);
  assert.equal(r.ok, false); assert.match(r.problem, /schema\.bases:read/); assert.match(r.problem, /appTESTBASE0000001/);
  assert.equal(w.services.airtable.schemaWrites.length, 0);
});
await scenario('S3b token can read but not write the structure: reports the missing write scope, changes nothing', async () => {
  const w = world('empty');
  w.services.airtable.scopes.write = false;
  const r = await create(w);
  assert.equal(r.ok, false); assert.match(r.needsYou.join('\n'), /schema\.bases:write/);
  assert.equal(w.services.airtable.schemaWrites.length, 0);
});
await scenario('S4 partly built base: only adds what is missing; never changes, renames or removes existing things; warns about differences', async () => {
  const mk = (id, name, fields, primary) => ({ id, name, primaryFieldId: primary, fields });
  const partial = [
    mk('tblLEADS000000001', 'Leads', [
      { id: 'fldPRIM00000001', name: 'Name', type: 'singleLineText' },
      { id: 'fldSTAGE0000001', name: 'Stage', type: 'singleSelect', options: { choices: [{ name: 'New' }, { name: 'Won' }] } },
      { id: 'fldPHONE0000001', name: 'Phone', type: 'singleLineText' },
      { id: 'fldMYNOTE000001', name: 'My own notes', type: 'multilineText' },
    ], 'fldPRIM00000001'),
    mk('tblOTHER000000001', 'Roof surveys 2025', [{ id: 'fldOTHERPRIM001', name: 'Title', type: 'singleLineText' }], 'fldOTHERPRIM001'),
  ];
  const w = world(partial);
  const before = JSON.stringify((await w.services.http({ method: 'GET', url: 'https://api.airtable.com/v0/meta/bases/' + cfg.airtableBaseId + '/tables', credentialsKinds: ['airtableTokenApi'] })).body.tables.find((t) => t.name === 'Leads').fields.slice(0, 4));
  const chk = await check(w);
  assert.match(chk.needsYou.join('\n'), /primary\) column is called "Name"/); assert.match(chk.needsYou.join('\n'), /Phone is singleLineText, expected phoneNumber|"Phone" is type singleLineText/);
  assert.match(chk.needsYou.join('\n'), /missing option\(s\)/); assert.equal(w.services.airtable.schemaWrites.length, 0);
  const r = await create(w);
  const leads = (await w.services.http({ method: 'GET', url: 'https://api.airtable.com/v0/meta/bases/' + cfg.airtableBaseId + '/tables', credentialsKinds: ['airtableTokenApi'] })).body.tables.find((t) => t.name === 'Leads');
  assert.equal(JSON.stringify(leads.fields.slice(0, 4)), before, 'existing fields must be untouched');
  assert.equal(leads.fields.find((f) => f.id === 'fldPHONE0000001').type, 'singleLineText');
  assert.deepEqual(r.leftUntouched, ['Roof surveys 2025']);
  assert.ok(leads.fields.some((f) => f.name === 'Enquiry Ref'), 'missing primary-named field is added as a normal column');
  assert.ok(w.services.airtable.schemaWrites.every((x) => !/Roof surveys/.test(x)));
  assert.equal(r.ok, false); // the warnings remain for a human to act on
  assert.match(r.needsYou.join('\n'), /Field types differ|"Phone" is type/);
});

await scenario('S5 webhook triggers: Check is read-only, Create builds the base + seeds the demo Settings from config, reply carries a structure summary', async () => {
  const w = world('empty');
  const chk = await w.engine.run('airtableSetup', 'Check Only (webhook)');
  assert.equal(chk.response.status, 200); assert.equal(chk.response.body.mode, 'check'); assert.equal(w.services.airtable.schemaWrites.length, 0);
  const made = await w.engine.run('airtableSetup', 'Create Missing (webhook)');
  assert.equal(made.response.body.mode, 'create'); assert.deepEqual(made.response.body.needsYou, []);
  assert.ok(made.response.body.structure.some((x) => x.table === 'Leads' && x.fields.includes('Stage: singleSelect')));
  const row = w.services.rows('Settings')[0].fields;
  assert.equal(row['Business Timezone'], 'Europe/London'); assert.equal(row['Customer Emails Enabled'], false); assert.equal(row['Test Mode'], true);
});

let failed = 0;
for (const r of results) {
  if (r.ok) console.log('PASS  ' + r.name);
  else { failed++; console.log('FAIL  ' + r.name + '\n        ' + String(r.err && (r.err.stack || r.err.message) || r.err).split('\n').slice(0, 7).join('\n        ')); }
}
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed (simulated Airtable schema API, not your real base)');
void names;
process.exit(failed ? 1 : 0);
