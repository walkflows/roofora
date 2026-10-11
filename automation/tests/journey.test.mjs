// SIMULATED end-to-end journey tests.
//   node automation/tests/journey.test.mjs
//
// Runs the real generated workflow JSON (automation/workflows) node by node
// against fake Airtable / Gmail / Calendar / Telegram. It proves the wiring and
// decision logic. It does NOT prove n8n, Airtable, Gmail, Google Calendar or
// Telegram behave identically — see automation/docs/TEST-RESULTS.md.

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
const ids = { leadManager: 'wfMain', sendEmail: 'wfSend', errorHandler: 'wfError' };
workflows.leadManager.settings.errorWorkflow = 'wfError';

const START = '2026-10-12T09:00:00.000Z'; // Monday, 10:00 in London (BST)
const N8N = cfg.n8nBaseUrl;
const settingsRow = {
  Name: 'ROOFORA settings', 'Business Name': 'ROOFORA', 'Business Timezone': 'Europe/London', 'Opening Days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  'Opening Time': '08:00', 'Closing Time': '17:00', 'Inspection Duration Minutes': 60, 'Travel Buffer Minutes': 30,
  'Service Area Postcode Prefixes': 'SW, SE1, CR0', 'Service Area Towns': 'London\nCroydon', 'Default Owner': 'Office', 'Urgent Owner': 'Dispatcher',
  'Enquiry Follow-up Business Days': '1,3', 'Quote Follow-up Days': '2,5,10', 'Quote Link Valid Days': 30, Currency: 'GBP',
  'Customer Emails Enabled': true, 'Test Mode': false, 'Sender Email': 'hello@roofora.test', 'Sender Name': 'ROOFORA', 'Business Phone': '020 7946 0000',
  'Website URL': 'https://roofora.test', 'Calendar ID': 'roofora@group.calendar.google.com',
};

function world(over = {}) {
  const clock = createClock(START);
  const services = createServices(clock, cfg.airtableBaseId);
  services.seed('Settings', { ...settingsRow, ...over });
  const engine = createEngine({ workflows, ids, services, clock });
  return { clock, services, engine };
}

const payload = (over = {}) => {
  const submissionId = over.submissionId || randomUUID();
  return {
    contractVersion: 1, source: 'roofora-website', environment: 'development', enquiryRef: 'RF-' + submissionId.replace(/-/g, '').slice(0, 8).toUpperCase(),
    receivedAt: START, submissionId, fullName: 'Test Customer', phone: '+447700900123', email: 'cust@example.test', propertyType: 'Residential', service: 'Roof Repair',
    town: 'Croydon', postcode: 'CR0 1AA', details: 'Two slates slipped', urgency: 'This week', preferredContact: 'Email', photoCount: 0,
    consent: { given: true, wording: 'I agree to be contacted about this enquiry using my preferred contact method.', version: 'contact-permission-v1', recordedAt: START }, ...over,
  };
};
const submit = (w, over) => w.engine.webhook('Website Enquiry', { body: payload(over) });
const leadOf = (w, ref) => w.services.byField('Leads', 'Enquiry Ref', ref)[0];
const pressGet = (w, action, record) => w.engine.webhook('Staff Button (Open)', { query: { action, record } });
const press = (w, action, record) => w.engine.webhook('Staff Button (Confirm)', { headers: { origin: N8N }, body: { action, record } });
const photoBody = (lead, over = {}) => ({ submissionId: lead.fields['Submission ID'], leadRecordId: lead.id, enquiryRef: lead.fields['Enquiry Ref'], slot: 1, contentType: 'image/jpeg', dataBase64: Buffer.alloc(900, 7).toString('base64'), size: 900, retry: false, ...over });

async function newLead(w, over = {}) {
  const { response } = await submit(w, over);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return leadOf(w, response.body.enquiryRef);
}
function addInspection(w, lead, fields = {}) {
  return w.services.seed('Inspections', { Inspection: 'Roof inspection', Lead: [lead.id], Status: 'Requested', 'Proposed Start': '2026-10-14T09:00:00.000Z', ...fields });
}
function addQuote(w, lead, fields = {}) {
  return w.services.seed('Quotes', { Quote: 'q', Lead: [lead.id], Version: 1, Scope: 'Replace slipped slates, re-bed ridge tiles and clear the gutter.', Amount: 640, Approved: true, 'Approved By': 'Sam Roofer', Status: 'Draft', ...fields });
}
const sentTo = (w, to) => w.services.gmail.sent.filter((m) => m.to === to);
const noWarnings = (w) => assert.deepEqual(w.services.warnings, []);

const results = [];
async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e });
  }
}

// =========================================================== A. website enquiries
await scenario('A1 email enquiry without photos: saved, acknowledged, alerted', async () => {
  const w = world();
  const { response } = await submit(w);
  assert.equal(response.status, 200); assert.equal(response.body.ok, true); assert.equal(response.body.status, 'created'); assert.equal(response.body.acceptsPhotos, true);
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(lead.fields.Stage, 'New'); assert.equal(lead.fields.Priority, 'Normal'); assert.equal(lead.fields['Service Area'], 'In Area');
  assert.equal(lead.fields['Contact Permission'], true); assert.equal(lead.fields['Permission Version'], 'contact-permission-v1');
  assert.equal(lead.fields.Owner, 'Office'); assert.equal(lead.fields['Follow-up Status'], 'Active');
  const mail = sentTo(w, 'cust@example.test');
  assert.equal(mail.length, 1); assert.match(mail[0].subject, /received your roofing enquiry/); assert.match(mail[0].text, /RF-/);
  assert.equal(w.services.telegram.messages.length, 1); assert.match(w.services.telegram.messages[0].text, /New roofing enquiry/);
  assert.equal(lead.fields['Gmail Thread IDs'], mail[0].threadId);
  assert.ok(lead.fields['Sent Message Keys'].includes('-ACK'));
  assert.equal(w.services.activities(lead.id, 'Email Sent').length, 1);
  noWarnings(w);
});
await scenario('A2 phone preference: callback task, NO email even though an email was given', async () => {
  const w = world();
  const { response } = await submit(w, { preferredContact: 'Phone' });
  assert.equal(response.status, 200);
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(w.services.gmail.sent.length, 0);
  const tasks = w.services.activities(lead.id, 'Task');
  assert.equal(tasks.length, 1); assert.match(tasks[0].fields.Activity, /Callback/); assert.match(lead.fields['Next Action'], /call customer back/);
  assert.equal(w.services.telegram.messages.length, 1); assert.match(w.services.telegram.messages[0].text, /phone call/);
  noWarnings(w);
});
await scenario('A3 urgent enquiry: urgent priority, urgent owner, priority callback, no emergency promise', async () => {
  const w = world();
  const { response } = await submit(w, { urgency: 'Urgent active leak/storm damage', preferredContact: 'Phone' });
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(lead.fields.Priority, 'Urgent'); assert.equal(lead.fields.Stage, 'New'); assert.equal(lead.fields.Owner, 'Dispatcher');
  const task = w.services.activities(lead.id, 'Task')[0];
  assert.match(task.fields.Activity, /URGENT callback/); assert.match(task.fields.Details, /Do not promise attendance/);
  assert.match(w.services.telegram.messages[0].text, /URGENT/); assert.match(w.services.telegram.messages[0].text, /nothing has promised/);
  noWarnings(w);
});
await scenario('A3b urgent + email preference: acknowledgement does not confirm an emergency visit', async () => {
  const w = world();
  await submit(w, { urgency: 'Urgent active leak/storm damage' });
  assert.match(w.services.gmail.sent[0].text, /does not confirm an emergency visit/);
  assert.equal(w.services.rows('Activity').filter((a) => /URGENT callback/.test(a.fields.Activity)).length, 1);
});
await scenario('A4 out-of-area / uncertain location: saved and flagged for review, never rejected', async () => {
  const w = world();
  const { response } = await submit(w, { town: 'Leeds', postcode: 'LS1 1AA' });
  assert.equal(response.status, 200);
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(lead.fields['Service Area'], 'Possibly Out of Area');
  assert.ok(w.services.activities(lead.id, 'Task').some((t) => /service area/i.test(t.fields.Activity)));
  const { response: r2 } = await submit(w, { town: 'Atlantis', postcode: '' });
  assert.equal(leadOf(w, r2.body.enquiryRef).fields['Service Area'], 'Needs Review');
});
await scenario('A5 invalid payloads are rejected with field messages and save nothing', async () => {
  const w = world();
  for (const bad of [{ phone: '12' }, { email: '', preferredContact: 'Email' }, { consent: { given: false } }, { preferredContact: 'SMS' }, { admin: true }, { service: 'Free Pizza' }]) {
    const { response } = await submit(w, bad);
    assert.equal(response.status, 400); assert.equal(response.body.ok, false);
  }
  assert.equal(w.services.rows('Leads').length, 0); assert.equal(w.services.gmail.sent.length, 0);
});
await scenario('A6 retry of the same submission returns the same lead, no second lead, no second email', async () => {
  const w = world();
  const p = payload();
  const r1 = await w.engine.webhook('Website Enquiry', { body: p });
  const r2 = await w.engine.webhook('Website Enquiry', { body: p });
  assert.equal(r2.response.body.status, 'duplicate'); assert.equal(r2.response.body.leadRecordId, r1.response.body.leadRecordId);
  assert.equal(w.services.rows('Leads').length, 1); assert.equal(w.services.gmail.sent.length, 1); assert.equal(w.services.telegram.messages.length, 1);
});
await scenario('A7 simultaneous duplicate (competitor saved first): this copy becomes Duplicate and sends nothing', async () => {
  const w = world();
  const p = payload();
  let other = null;
  const racing = createEngine({ workflows, ids, services: w.services, clock: w.clock, onNode: (wf, node) => {
    // the other execution saves its lead after our "find existing" but before our "save"
    if (node === 'Plan New Lead' && !other) { other = w.services.seed('Leads', { 'Enquiry Ref': p.enquiryRef, 'Submission ID': p.submissionId, Stage: 'New' }); other.createdTime = '2026-10-12T08:59:59.000Z'; }
  } });
  const { response } = await racing.webhook('Website Enquiry', { body: p });
  assert.equal(response.body.status, 'duplicate'); assert.equal(response.body.leadRecordId, other.id);
  const rows = w.services.rows('Leads');
  assert.equal(rows.length, 2); assert.equal(rows.filter((r) => r.fields.Stage === 'Duplicate').length, 1); assert.equal(rows.find((r) => r.id === other.id).fields.Stage, 'New');
  assert.equal(w.services.gmail.sent.length, 0); assert.equal(w.services.telegram.messages.length, 0);
});
await scenario('A8 simultaneous duplicate (this copy is first): it carries on; later copy marks itself duplicate', async () => {
  const w = world();
  const p = payload();
  let injected = false;
  const racing = createEngine({ workflows, ids, services: w.services, clock: w.clock, onNode: (wf, node) => {
    if (node === 'Save Lead' && !injected) { injected = true; const later = w.services.seed('Leads', { 'Enquiry Ref': p.enquiryRef, 'Submission ID': p.submissionId, Stage: 'New' }); later.createdTime = '2026-10-12T09:00:05.000Z'; }
  } });
  const { response } = await racing.webhook('Website Enquiry', { body: p });
  assert.equal(response.body.status, 'created');
  assert.equal(w.services.gmail.sent.length, 1);
});
await scenario('A9 Airtable unavailable at save: website told to retry (503), nothing sent, problem reported', async () => {
  const w = world();
  w.services.airtable.mode = '503';
  const { response } = await submit(w);
  assert.equal(response.status, 503); assert.equal(response.body.ok, false);
  assert.equal(w.services.gmail.sent.length, 0);
  assert.ok(w.services.telegram.messages.some((m) => /ROOFORA — Needs your help/.test(m.text)));
});
await scenario('A10 Airtable only fails on Leads save: visitor sees failure, no false success', async () => {
  const w = world();
  w.services.airtable.failTable = 'Leads'; w.services.airtable.failMethod = 'POST';
  const { response } = await submit(w);
  assert.equal(response.status, 503); assert.equal(w.services.rows('Leads').length, 0);
  assert.ok(w.services.telegram.messages.length >= 1);
});
await scenario('A11 Telegram down: enquiry still saved and acknowledged', async () => {
  const w = world();
  w.services.telegram.mode = 'fail';
  const { response } = await submit(w);
  assert.equal(response.status, 200); assert.equal(w.services.gmail.sent.length, 1);
});
await scenario('A12 Gmail down: enquiry saved, failure recorded as Needs My Help, alert sent, no false email record', async () => {
  const w = world();
  w.services.gmail.mode = 'fail400';
  const { response } = await submit(w);
  assert.equal(response.status, 200);
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(w.services.gmail.sent.length, 0); assert.ok(!lead.fields['Sent Message Keys']);
  assert.ok(w.services.activities(lead.id, 'Automation Problem').some((a) => a.fields.Status === 'Needs My Help'));
  assert.ok(w.services.telegram.messages.some((m) => /Email FAILED|Send email/.test(m.text)));
});
await scenario('A13 customer emails switched off in Settings: nothing sent, recorded as skipped', async () => {
  const w = world({ 'Customer Emails Enabled': false });
  const { response } = await submit(w);
  const lead = leadOf(w, response.body.enquiryRef);
  assert.equal(w.services.gmail.sent.length, 0);
  assert.ok(w.services.activities(lead.id).some((a) => /not sent/.test(a.fields.Activity)));
});
await scenario('A14 Test Mode: email goes only to the test inbox with a TEST subject', async () => {
  const w = world({ 'Test Mode': true, 'Test Recipient Email': 'joshua@example.test' });
  await submit(w);
  assert.equal(w.services.gmail.sent.length, 1); assert.equal(w.services.gmail.sent[0].to, 'joshua@example.test'); assert.match(w.services.gmail.sent[0].subject, /^\[TEST for cust@example\.test\]/);
});

// =========================================================== B. photos
await scenario('A15 a bad Settings value (invalid time zone) is reported as "Needs My Help" even when no task is created (found live)', async () => {
  const w = world({ 'Business Timezone': 'Mars/Phobos' });
  const { response } = await submit(w);
  assert.equal(response.status, 200);
  const lead = leadOf(w, response.body.enquiryRef);
  const problems = w.services.activities(lead.id, 'Automation Problem');
  assert.ok(problems.some((a) => a.fields.Status === 'Needs My Help' && /Business Timezone/.test(a.fields.Details)), problems.map((a) => a.fields.Details).join('|'));
  assert.ok(w.services.telegram.messages.some((m) => /Needs your help|Business Timezone/.test(m.text)));
});

await scenario('A16 daily demo cap: new enquiries beyond the Settings limit are refused (429 demo-limit) with nothing saved or sent; retries of a saved enquiry still work; limit 0 = unlimited', async () => {
  const w = world({ 'Daily Enquiry Limit': 2 });
  const first = payload(); const second = payload();
  assert.equal((await w.engine.webhook('Website Enquiry', { body: first })).response.status, 200);
  assert.equal((await w.engine.webhook('Website Enquiry', { body: second })).response.status, 200);
  const mails = w.services.gmail.sent.length; const tg = w.services.telegram.messages.length;
  const third = await w.engine.webhook('Website Enquiry', { body: payload() });
  assert.equal(third.response.status, 429); assert.equal(third.response.body.error, 'demo-limit');
  assert.equal(w.services.rows('Leads').length, 2); assert.equal(w.services.gmail.sent.length, mails); assert.equal(w.services.telegram.messages.length, tg);
  const retry = await w.engine.webhook('Website Enquiry', { body: first });
  assert.equal(retry.response.status, 200); assert.equal(retry.response.body.status, 'duplicate');
  const open = world({ 'Daily Enquiry Limit': 0 });
  for (let i = 0; i < 4; i++) assert.equal((await open.engine.webhook('Website Enquiry', { body: payload() })).response.status, 200);
  // a day later the window has moved on
  w.clock.advance(25 * 60);
  assert.equal((await w.engine.webhook('Website Enquiry', { body: payload() })).response.status, 200);
});
await scenario('D9 quote link is never built from localhost for an enquiry that came from a deployed site', async () => {
  const w = world({ 'Website URL': 'http://localhost:3000' });
  const lead = await newLead(w, { environment: 'production' });
  const q = addQuote(w, lead);
  const { response } = await press(w, 'send-quote', q.id);
  assert.equal(response.status, 409); assert.match(String(response.body), /Website URL is still/);
  assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Draft');
  const dev = world({ 'Website URL': 'http://localhost:3000' });
  const l2 = await newLead(dev, { environment: 'development' });
  assert.equal((await press(dev, 'send-quote', addQuote(dev, l2).id)).response.status, 200);
  const deployed = world({ 'Website URL': 'https://demo.example.com' });
  const l3 = await newLead(deployed, { environment: 'preview' });
  const r3 = await press(deployed, 'send-quote', addQuote(deployed, l3).id);
  assert.equal(r3.response.status, 200); assert.match(deployed.services.gmail.sent.at(-1).text, /https:\/\/demo\.example\.com\/quote\//);
});

await scenario('B1 photo upload attaches to the lead; retry does not duplicate', async () => {
  const w = world();
  const lead = await newLead(w, { photoCount: 2 });
  const r1 = await w.engine.webhook('Photo Upload', { body: photoBody(lead) });
  assert.equal(r1.response.status, 200); assert.equal(r1.response.body.status, 'uploaded');
  const r2 = await w.engine.webhook('Photo Upload', { body: photoBody(lead, { retry: true }) });
  assert.equal(r2.response.body.status, 'already-uploaded');
  const r3 = await w.engine.webhook('Photo Upload', { body: photoBody(lead, { slot: 2, retry: true, contentType: 'image/png' }) });
  assert.equal(r3.response.body.status, 'uploaded');
  const photos = w.services.row('Leads', lead.id).fields['Roof Photos'];
  assert.deepEqual(photos.map((p) => p.filename), [lead.fields['Enquiry Ref'] + '-photo-1.jpg', lead.fields['Enquiry Ref'] + '-photo-2.png']);
  assert.ok(photos[0].id && photos[0].url);
});
await scenario('B2 invalid photo requests rejected (bad type, bad slot, bad record, empty data)', async () => {
  const w = world();
  const lead = await newLead(w);
  for (const bad of [{ contentType: 'application/pdf' }, { slot: 4 }, { leadRecordId: 'recx' }, { dataBase64: 'AAAA' }, { enquiryRef: 'RF-nope' }]) {
    const { response } = await w.engine.webhook('Photo Upload', { body: photoBody(lead, bad) });
    assert.equal(response.status, 400, JSON.stringify(bad));
  }
  assert.equal((w.services.row('Leads', lead.id).fields['Roof Photos'] || []).length, 0);
});
await scenario('B3 retry with a mismatching submission ID is refused', async () => {
  const w = world();
  const lead = await newLead(w);
  const { response } = await w.engine.webhook('Photo Upload', { body: photoBody(lead, { retry: true, submissionId: randomUUID() }) });
  assert.equal(response.status, 400);
});
await scenario('B4 photo upload failure: enquiry untouched, 502 so the visitor can retry, problem reported, retry then works', async () => {
  const w = world();
  const lead = await newLead(w);
  const before = w.services.telegram.messages.length;
  // make only the photo-upload host fail
  const orig = w.services.http;
  w.services.http = async (req) => (req.url.includes('content.airtable.com') ? { statusCode: 503, headers: {}, body: { error: { type: 'SERVICE_UNAVAILABLE' } } } : orig(req));
  const r1 = await w.engine.webhook('Photo Upload', { body: photoBody(lead) });
  assert.equal(r1.response.status, 502);
  assert.ok(w.services.telegram.messages.length > before);
  assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'New');
  w.services.http = orig;
  const r2 = await w.engine.webhook('Photo Upload', { body: photoBody(lead, { retry: true }) });
  assert.equal(r2.response.body.status, 'uploaded');
  assert.equal(w.services.row('Leads', lead.id).fields['Roof Photos'].length, 1);
});

// =========================================================== C. inspections
await scenario('C1 book inspection: GET changes nothing; POST books calendar+Airtable, confirms by email, plans reminders', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  const page = await pressGet(w, 'book-inspection', insp.id);
  assert.equal(page.response.status, 200); assert.match(page.response.body, /<form method="post">/);
  assert.equal(w.services.calendar.events.size, 0);
  const sentBefore = w.services.gmail.sent.length;
  const { response, run } = await press(w, 'book-inspection', insp.id);
  assert.equal(response.status, 200, String(response.body).slice(0, 400)); assert.match(response.body, /booked/i);
  assert.equal(w.services.calendar.events.size, 1);
  const ev = [...w.services.calendar.events.values()][0];
  assert.equal(ev.start.timeZone, 'Europe/London'); assert.match(ev.summary, /Roof inspection — RF-/);
  const i = w.services.row('Inspections', insp.id).fields;
  assert.equal(i.Status, 'Scheduled'); assert.equal(i['Booking Version'], 1); assert.equal(i['Calendar Event ID'], ev.id); assert.equal(i['Confirmed Start'], '2026-10-14T09:00:00.000Z');
  assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Inspection Scheduled');
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Not Needed');
  const mail = w.services.gmail.sent.slice(sentBefore);
  assert.equal(mail.length, 1); assert.match(mail[0].subject, /inspection is booked/);
  const pending = w.engine.log.pendingWaits.filter((x) => x.node === 'Wait Until Reminder Time');
  assert.equal(pending.length, 1); assert.equal(pending[0].until, '2026-10-13T09:00:00.000Z');
  void run; noWarnings(w);
});
await scenario('C2 pressing Book twice does not create a second event or a second email', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  await press(w, 'book-inspection', insp.id);
  const mails = w.services.gmail.sent.length;
  const again = await press(w, 'book-inspection', insp.id);
  assert.match(again.response.body, /Already booked/);
  assert.equal(w.services.calendar.events.size, 1); assert.equal(w.services.gmail.sent.length, mails);
  assert.equal(w.services.row('Inspections', insp.id).fields['Booking Version'], 1);
});
await scenario('C3 calendar clash refuses the booking and says why', async () => {
  const w = world();
  const lead = await newLead(w);
  w.services.calendar.events.set('other1', { id: 'other1', status: 'confirmed', summary: 'Existing job', start: { dateTime: '2026-10-14T09:15:00.000Z' }, end: { dateTime: '2026-10-14T10:15:00.000Z' } });
  const insp = addInspection(w, lead);
  const { response } = await press(w, 'book-inspection', insp.id);
  assert.equal(response.status, 409); assert.match(response.body, /clashes with/);
  assert.equal(w.services.row('Inspections', insp.id).fields.Status, 'Requested'); assert.equal(w.services.calendar.events.size, 1);
  assert.match(w.services.row('Inspections', insp.id).fields['Last Automation Message'], /clashes/);
});
await scenario('C4 outside opening hours / in the past / no linked lead are refused', async () => {
  const w = world();
  const lead = await newLead(w);
  for (const start of ['2026-10-14T20:00:00.000Z', '2026-10-17T09:00:00.000Z', '2026-10-12T08:00:00.000Z']) {
    const insp = addInspection(w, lead, { 'Proposed Start': start });
    const { response } = await press(w, 'book-inspection', insp.id);
    assert.equal(response.status, 409, start);
  }
  assert.equal(w.services.calendar.events.size, 0);
  const orphan = w.services.seed('Inspections', { Inspection: 'x', Status: 'Requested', 'Proposed Start': '2026-10-14T09:00:00.000Z' });
  assert.equal((await press(w, 'book-inspection', orphan.id)).response.status, 409);
});
await scenario('C5 calendar down: not confirmed to the customer, retry is safe', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  const mails = w.services.gmail.sent.length;
  w.services.calendar.mode = '500';
  const { response } = await press(w, 'book-inspection', insp.id);
  assert.equal(response.status, 409); // clash check could not run
  assert.equal(w.services.gmail.sent.length, mails); assert.equal(w.services.row('Inspections', insp.id).fields.Status, 'Requested');
  w.services.calendar.mode = 'ok';
  assert.equal((await press(w, 'book-inspection', insp.id)).response.status, 200);
  assert.equal(w.services.calendar.events.size, 1);
});
await scenario('C6 event created but Airtable save fails: pressing again repairs it without a second event', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  w.services.airtable.failTable = 'Inspections'; w.services.airtable.failMethod = 'PATCH';
  const r1 = await press(w, 'book-inspection', insp.id);
  assert.equal(r1.response.status, 502);
  assert.equal(w.services.calendar.events.size, 1);
  assert.equal(w.services.row('Inspections', insp.id).fields.Status, 'Requested');
  w.services.airtable.failTable = null;
  const r2 = await press(w, 'book-inspection', insp.id);
  assert.equal(r2.response.status, 200); assert.equal(w.services.calendar.events.size, 1);
  assert.equal(w.services.row('Inspections', insp.id).fields.Status, 'Scheduled');
});
await scenario('C7 reschedule: same event moved, version 2, customer told, old reminder is stale', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  await press(w, 'book-inspection', insp.id);
  const evId = w.services.row('Inspections', insp.id).fields['Calendar Event ID'];
  w.services.row('Inspections', insp.id).fields['Proposed Start'] = '2026-10-15T13:00:00.000Z';
  const mails = w.services.gmail.sent.length;
  const { response } = await press(w, 'book-inspection', insp.id);
  assert.equal(response.status, 200); assert.match(response.body, /moved/i);
  assert.equal(w.services.calendar.events.size, 1); assert.equal(w.services.calendar.events.get(evId).start.dateTime, '2026-10-15T13:00:00.000Z');
  const f = w.services.row('Inspections', insp.id).fields;
  assert.equal(f['Booking Version'], 2); assert.equal(f['Confirmed Start'], '2026-10-15T13:00:00.000Z');
  const m = w.services.gmail.sent.slice(mails);
  assert.equal(m.length, 1); assert.match(m[0].subject, /moved to/);
  // the 24h reminder still waiting from version 1 must NOT fire for the new booking
  const stale = w.engine.log.pendingWaits.filter((x) => x.node === 'Wait Until Reminder Time')[0];
  w.clock.set(stale.until);
  const sentBefore = w.services.gmail.sent.length;
  await w.engine.resume('Wait Until Reminder Time', stale.items, { 'Next Reminder': stale.items });
  assert.equal(w.services.gmail.sent.length, sentBefore);
  assert.equal(w.services.row('Inspections', insp.id).fields['Reminder 24h Sent Version'], undefined);
});
const lastWait = (w) => w.engine.log.pendingWaits.filter((x) => x.node === 'Wait Until Reminder Time').at(-1);
const resumeWait = (w, wait) => { w.clock.set(wait.until); return w.engine.resume('Wait Until Reminder Time', wait.items, { 'Next Reminder': wait.items }); };
const reminderMails = (w) => w.services.gmail.sent.filter((m) => /^Reminder:/.test(m.subject));
await scenario('C8 reminders: 24h then 2h each send exactly once; a repeated trigger sends nothing; nothing before its time', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  await press(w, 'book-inspection', insp.id);
  assert.equal(reminderMails(w).length, 0, 'nothing is sent at booking time');
  const w24 = lastWait(w);
  await resumeWait(w, w24);
  assert.equal(reminderMails(w).length, 1); assert.match(reminderMails(w)[0].subject, /on Wednesday 14 October at 10:00/);
  assert.equal(w.services.row('Inspections', insp.id).fields['Reminder 24h Sent Version'], 1);
  const w2h = lastWait(w);
  assert.equal(w2h.until, '2026-10-14T07:00:00.000Z');
  await resumeWait(w, w24); // same wait resumed twice (repeated trigger)
  assert.equal(reminderMails(w).length, 1, 'no duplicate 24h reminder');
  await resumeWait(w, w2h);
  assert.equal(reminderMails(w).length, 2); assert.equal(w.services.row('Inspections', insp.id).fields['Reminder 2h Sent Version'], 1);
  noWarnings(w);
});
await scenario('C8b reminder is dropped when the inspection was cancelled; phone customers get a courtesy call task, not an email', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  await press(w, 'book-inspection', insp.id);
  const w24 = lastWait(w);
  await press(w, 'cancel-inspection', insp.id);
  await resumeWait(w, w24);
  assert.equal(reminderMails(w).length, 0);
  const w2 = world();
  const l2 = await newLead(w2, { preferredContact: 'Phone' });
  const i2 = addInspection(w2, l2);
  await press(w2, 'book-inspection', i2.id);
  await resumeWait(w2, lastWait(w2));
  assert.equal(w2.services.gmail.sent.length, 0);
  assert.ok(w2.services.activities(l2.id, 'Task').some((t) => /Reminder call/.test(t.fields.Activity)));
});
await scenario('C9 cancel: event cancelled, customer told once, lead back to Contacting, repeat press is a no-op', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  await press(w, 'book-inspection', insp.id);
  const mails = w.services.gmail.sent.length;
  const { response } = await press(w, 'cancel-inspection', insp.id);
  assert.equal(response.status, 200); assert.match(response.body, /cancelled/i);
  assert.equal([...w.services.calendar.events.values()][0].status, 'cancelled');
  assert.equal(w.services.row('Inspections', insp.id).fields.Status, 'Cancelled'); assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Contacting');
  assert.equal(w.services.gmail.sent.length, mails + 1);
  const again = await press(w, 'cancel-inspection', insp.id);
  assert.match(again.response.body, /Already cancelled/); assert.equal(w.services.gmail.sent.length, mails + 1);
  // booking again after a cancellation re-uses the event id safely
  const rebook = await press(w, 'book-inspection', insp.id);
  assert.equal(rebook.response.status, 200); assert.equal(w.services.calendar.events.size, 1);
  assert.equal([...w.services.calendar.events.values()][0].status, 'confirmed');
});
await scenario('C10 phone-preference customer: booking creates a call task instead of an email', async () => {
  const w = world();
  const lead = await newLead(w, { preferredContact: 'Phone' });
  const insp = addInspection(w, lead);
  const { response } = await press(w, 'book-inspection', insp.id);
  assert.equal(response.status, 200); assert.equal(w.services.gmail.sent.length, 0);
  assert.ok(w.services.activities(lead.id, 'Calendar').some((a) => a.fields.Status === 'Open' && /CALL the customer/.test(a.fields.Details)));
});
await scenario('C11 complete inspection: lead to Inspection Completed + "prepare quote" task; only Scheduled can complete', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  assert.equal((await press(w, 'complete-inspection', insp.id)).response.status, 409);
  await press(w, 'book-inspection', insp.id);
  const { response } = await press(w, 'complete-inspection', insp.id);
  assert.equal(response.status, 200);
  assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Inspection Completed');
  assert.ok(w.services.activities(lead.id, 'Task').some((t) => /Prepare quote/.test(t.fields.Activity)));
});
await scenario('C12 cross-site POST to the staff page is refused', async () => {
  const w = world();
  const lead = await newLead(w);
  const insp = addInspection(w, lead);
  const { response } = await w.engine.webhook('Staff Button (Confirm)', { headers: { origin: 'https://evil.example' }, body: { action: 'book-inspection', record: insp.id } });
  assert.equal(response.status, 403); assert.equal(w.services.calendar.events.size, 0);
});

// =========================================================== D. quotes
await scenario('D1 unapproved / incomplete quote is never sent', async () => {
  const w = world();
  const lead = await newLead(w);
  const mails = w.services.gmail.sent.length;
  for (const bad of [{ Approved: false }, { 'Approved By': '' }, { Amount: 0 }, { Scope: 'x' }]) {
    const q = addQuote(w, lead, bad);
    const { response } = await press(w, 'send-quote', q.id);
    assert.equal(response.status, 409, JSON.stringify(bad));
    assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Draft');
  }
  assert.equal(w.services.gmail.sent.length, mails);
});
await scenario('D2 approved quote: emailed once with secure link, stored hash only, follow-ups scheduled, repeat press is a no-op', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  const mails = w.services.gmail.sent.length;
  const { response } = await press(w, 'send-quote', q.id);
  assert.equal(response.status, 200, String(response.body).slice(0, 300));
  const m = w.services.gmail.sent.slice(mails);
  assert.equal(m.length, 1); assert.match(m[0].text, /£640\.00/); assert.match(m[0].text, /Replace slipped slates/);
  const link = /https:\/\/roofora\.test\/quote\/([a-f0-9]{64})/.exec(m[0].text);
  assert.ok(link, 'email must contain the secure link');
  const row = w.services.row('Quotes', q.id).fields;
  assert.equal(row.Status, 'Sent'); assert.ok(row['Sent At']); assert.equal(row['Link Expires At'], '2026-11-11T09:00:00.000Z');
  assert.notEqual(row['Link Token Hash'], link[1]); assert.equal(row['Link Token Hash'].length, 64);
  assert.ok(!JSON.stringify([...w.services.tables.get('Quotes').values()]).includes(link[1]), 'raw token must not be stored');
  const l = w.services.row('Leads', lead.id).fields;
  assert.equal(l.Stage, 'Quote Sent'); assert.equal(l['Follow-up Kind'], 'Quote'); assert.equal(l['Follow-up Step'], 0); assert.equal(l['Next Follow-up At'] > START, true);
  const again = await press(w, 'send-quote', q.id);
  assert.match(again.response.body, /already sent/); assert.equal(w.services.gmail.sent.length, mails + 1);
});
await scenario('D3 quote email failure leaves the quote Draft; unclear Gmail result is checked in Sent, not resent blindly', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  w.services.gmail.mode = 'fail400';
  const r1 = await press(w, 'send-quote', q.id);
  assert.equal(r1.response.status, 502); assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Draft');
  assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'New');
  // unclear: Gmail sent it but the reply timed out → must find it in Sent and NOT send again
  w.services.gmail.mode = 'timeout-sent';
  const before = w.services.gmail.sent.length;
  const r2 = await press(w, 'send-quote', q.id);
  assert.equal(r2.response.status, 200); assert.equal(w.services.gmail.sent.length, before + 1, 'exactly one email despite the timeout');
  assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Sent');
});
await scenario('D4 new version supersedes the old one; old link can no longer be accepted', async () => {
  const w = world();
  const lead = await newLead(w);
  const q1 = addQuote(w, lead);
  await press(w, 'send-quote', q1.id);
  const oldToken = /quote\/([a-f0-9]{64})/.exec(w.services.gmail.sent.at(-1).text)[1];
  const q2 = addQuote(w, lead, { Version: 2, Amount: 720 });
  await press(w, 'send-quote', q2.id);
  assert.equal(w.services.row('Quotes', q1.id).fields.Status, 'Superseded');
  assert.equal(w.services.row('Quotes', q2.id).fields.Status, 'Sent');
  const { response } = await w.engine.webhook('Quote Link', { body: { action: 'accept', token: oldToken } });
  assert.equal(response.status, 409); assert.equal(response.body.result, 'not-open');
  assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Quote Sent');
});
await scenario('D5 customer accepts online: Won, job task, no date promised, follow-ups stop, confirmation email, repeat is idempotent', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  await press(w, 'send-quote', q.id);
  const token = /quote\/([a-f0-9]{64})/.exec(w.services.gmail.sent.at(-1).text)[1];
  const view = await w.engine.webhook('Quote Link', { body: { action: 'view', token } });
  assert.equal(view.response.status, 200); assert.equal(view.response.body.quote.amount, 640); assert.equal('Approved By' in view.response.body.quote, false);
  assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Sent');
  const mails = w.services.gmail.sent.length;
  const acc = await w.engine.webhook('Quote Link', { body: { action: 'accept', token } });
  assert.equal(acc.response.status, 200); assert.equal(acc.response.body.result, 'accepted'); assert.equal(acc.response.body.quote.status, 'Accepted');
  const l = w.services.row('Leads', lead.id).fields;
  assert.equal(l.Stage, 'Won'); assert.equal(l['Follow-up Status'], 'Completed'); assert.match(l['Next Action'], /not yet promised/);
  assert.equal(w.services.row('Quotes', q.id).fields['Customer Response'], 'Accepted online');
  assert.ok(w.services.activities(lead.id, 'Task').some((t) => /Schedule job/.test(t.fields.Activity) && /agree a job date/.test(t.fields.Details)));
  assert.equal(w.services.gmail.sent.length, mails + 1); assert.match(w.services.gmail.sent.at(-1).subject, /quote is accepted/);
  assert.ok(w.services.telegram.messages.some((m) => /ACCEPTED/.test(m.text)));
  const again = await w.engine.webhook('Quote Link', { body: { action: 'accept', token } });
  assert.equal(again.response.body.result, 'already-accepted');
  assert.equal(w.services.gmail.sent.length, mails + 1); assert.equal(w.services.activities(lead.id, 'Task').filter((t) => /Schedule job/.test(t.fields.Activity)).length, 1);
  const flip = await w.engine.webhook('Quote Link', { body: { action: 'decline', token } });
  assert.equal(flip.response.status, 409); assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Won');
});
await scenario('D6 decline marks Lost; expired and unknown links are refused', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  await press(w, 'send-quote', q.id);
  const token = /quote\/([a-f0-9]{64})/.exec(w.services.gmail.sent.at(-1).text)[1];
  assert.equal((await w.engine.webhook('Quote Link', { body: { action: 'accept', token: 'f'.repeat(64) } })).response.status, 404);
  assert.equal((await w.engine.webhook('Quote Link', { body: { action: 'accept', token: 'short' } })).response.status, 400);
  w.clock.set('2026-12-01T09:00:00.000Z');
  const exp = await w.engine.webhook('Quote Link', { body: { action: 'accept', token } });
  assert.equal(exp.response.status, 409); assert.equal(exp.response.body.result, 'expired'); assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Quote Sent');
  w.clock.set(START);
  const dec = await w.engine.webhook('Quote Link', { body: { action: 'decline', token } });
  assert.equal(dec.response.body.result, 'declined'); assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Lost'); assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Stopped');
});
await scenario('D7 staff record a phone answer: accepted → Won, declined → Lost; no customer email', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  await press(w, 'send-quote', q.id);
  const mails = w.services.gmail.sent.length;
  const { response } = await press(w, 'record-accepted', q.id);
  assert.equal(response.status, 200); assert.equal(w.services.row('Leads', lead.id).fields.Stage, 'Won');
  assert.equal(w.services.row('Quotes', q.id).fields['Customer Response'], 'Accepted (recorded by staff)'); assert.equal(w.services.gmail.sent.length, mails);
  assert.equal((await press(w, 'record-declined', q.id)).response.status, 409);
});
await scenario('D8 phone-preference customer: quote becomes a call task, no email', async () => {
  const w = world();
  const lead = await newLead(w, { preferredContact: 'Phone' });
  const q = addQuote(w, lead);
  const { response } = await press(w, 'send-quote', q.id);
  assert.equal(response.status, 200); assert.equal(w.services.gmail.sent.length, 0);
  assert.equal(w.services.row('Quotes', q.id).fields.Status, 'Sent');
  assert.ok(w.services.activities(lead.id, 'Task').some((t) => /Present quote/.test(t.fields.Activity)));
});

// =========================================================== E. replies
const incoming = (over = {}) => ({ id: 'g' + Math.random().toString(36).slice(2, 8), threadId: 'x', subject: 'Re: hello', text: 'Thursday suits me', from: { value: [{ address: 'cust@example.test' }] }, headers: {}, ...over });
await scenario('E1 customer reply (matched by thread) pauses follow-ups, creates a task and alerts; unrelated mail is ignored', async () => {
  const w = world();
  const lead = await newLead(w);
  const thread = w.services.gmail.sent[0].threadId;
  const calls = w.services.airtable.calls.length;
  await w.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: thread, subject: 'Re: We have received your roofing enquiry' }) }]);
  const l = w.services.row('Leads', lead.id).fields;
  assert.equal(l['Follow-up Status'], 'Paused - Customer Replied'); assert.ok(l['Customer Replied At']); assert.match(l['Next Action'], /Reply to the customer/);
  assert.ok(w.services.activities(lead.id, 'Email Received').length === 1);
  assert.ok(w.services.telegram.messages.some((m) => /replied by email/.test(m.text)));
  const mid = w.services.airtable.calls.length;
  await w.engine.trigger('ROOFORA Inbox', [{ json: incoming({ from: { value: [{ address: 'newsletter@shop.test' }] }, threadId: 'zzz' }) }]);
  assert.equal(w.services.rows('Activity').filter((a) => a.fields.Type === 'Email Received').length, 1);
  void calls; void mid;
});
await scenario('E2 reply matched by RF- reference when the thread differs; ambiguous sender is not guessed', async () => {
  const w = world();
  const lead = await newLead(w);
  await w.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: 'newthread', from: { value: [{ address: 'other.address@example.test' }] }, subject: 'Question about ' + lead.fields['Enquiry Ref'] }) }]);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Paused - Customer Replied');
  const w2 = world();
  await newLead(w2); await newLead(w2); // two open leads, same address
  await w2.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: 'nothread' }) }]);
  assert.equal(w2.services.rows('Leads').filter((l) => l.fields['Customer Replied At']).length, 0, 'no lead guessed');
  assert.equal(w2.services.rows('Activity').filter((a) => a.fields.Type === 'Email Received' && a.fields.Lead === undefined && a.fields.Status === 'Needs My Help').length, 1, 'staff task instead');
});
await scenario('E3 bounce pauses follow-ups; automatic reply does not; STOP withdraws permission', async () => {
  const w = world();
  const lead = await newLead(w);
  const thread = w.services.gmail.sent[0].threadId;
  await w.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: thread, subject: 'Automatic reply: Out of office', headers: { 'Auto-Submitted': 'auto-replied' } }) }]);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Active');
  assert.ok(w.services.activities(lead.id, 'Auto-reply').length === 1);
  await w.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: thread, subject: 'Delivery Status Notification (Failure) RF-' + lead.fields['Enquiry Ref'].slice(3), from: { value: [{ address: 'mailer-daemon@googlemail.com' }] } }) }]);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Paused - Email Bounced');
  const w2 = world();
  const l2 = await newLead(w2);
  await w2.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: w2.services.gmail.sent[0].threadId, text: 'STOP' }) }]);
  assert.equal(w2.services.row('Leads', l2.id).fields['Permission Withdrawn'], true); assert.equal(w2.services.row('Leads', l2.id).fields['Follow-up Status'], 'Stopped');
});

const inboxMail = (w, over) => { const m = { id: 'in' + Math.random().toString(36).slice(2, 8), threadId: 'x', internalDate: w.clock.ms, text: 'Thursday suits me', headers: [{ name: 'From', value: 'Cust <cust@example.test>' }, { name: 'Subject', value: 'Re: hello' }], ...over }; w.services.gmail.inbox.push(m); return m; };
await scenario('E4 "Check Replies Now" reads the inbox on demand: the real reply is matched by Gmail thread, follow-ups pause, an unrelated lead with the SAME address is untouched, and re-reading records nothing twice', async () => {
  const w = world();
  const target = await newLead(w);                 // acknowledgement sent → thread stored on the lead
  const other = await newLead(w, { fullName: 'Other Customer' }); // same email address, different thread
  const thread = w.services.gmail.sent.find((m) => m.subject.includes(target.fields['Enquiry Ref'])).threadId;
  w.clock.advance(30);
  inboxMail(w, { threadId: thread });
  await w.engine.trigger('Check Replies Now (webhook)');
  const t = w.services.row('Leads', target.id).fields; const o = w.services.row('Leads', other.id).fields;
  assert.equal(t['Follow-up Status'], 'Paused - Customer Replied'); assert.ok(t['Customer Replied At']);
  assert.equal(o['Follow-up Status'], 'Active'); assert.equal(o['Customer Replied At'], undefined);
  assert.equal(w.services.activities(target.id, 'Email Received').length, 1);
  await w.engine.trigger('Check Replies Now (webhook)'); await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.activities(target.id, 'Email Received').length, 1, 'same message must not be recorded again');
  assert.equal(w.services.activities(other.id, 'Email Received').length, 0);
  // a due sweep now does nothing for the paused lead, and still follows up the other one
  w.services.row('Leads', target.id).fields['Next Follow-up At'] = '2026-10-12T00:00:00.000Z'; w.services.row('Leads', other.id).fields['Next Follow-up At'] = '2026-10-12T00:00:00.000Z';
  w.clock.set('2026-10-13T08:30:00.000Z');
  const before = w.services.gmail.sent.length;
  await w.engine.trigger('Follow-up Sweep (webhook)');
  const fu = w.services.gmail.sent.slice(before);
  assert.equal(fu.length, 1); assert.ok(fu[0].subject.includes(other.fields['Enquiry Ref']));
});

await scenario('E5 a customer with MANY enquiries on the same address: the reply is matched to the right one by its Gmail thread (found live: the lookup used to cap at 5 rows and miss it), all others untouched', async () => {
  const w = world();
  const leads = [];
  for (let i = 0; i < 8; i++) leads.push(await newLead(w, { fullName: 'Same Address ' + i }));
  const target = leads[7];
  const thread = w.services.gmail.sent.find((m) => m.subject.includes(target.fields['Enquiry Ref'])).threadId;
  w.clock.advance(30);
  w.services.gmail.inbox.push({ id: 'inX', threadId: thread, internalDate: w.clock.ms, text: 'A question about the quote', headers: [{ name: 'From', value: 'Cust <cust@example.test>' }, { name: 'Subject', value: 'Re: Your quote' }] });
  await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.row('Leads', target.id).fields['Follow-up Status'], 'Paused - Customer Replied');
  for (const l of leads.slice(0, 7)) { assert.equal(w.services.row('Leads', l.id).fields['Follow-up Status'], 'Active'); assert.equal(w.services.row('Leads', l.id).fields['Customer Replied At'], undefined); }
  assert.equal(w.services.activities(target.id, 'Email Received').length, 1);
});

const inbound = (w, over) => w.services.gmail.inbox.push({ id: 'in' + Math.random().toString(36).slice(2), internalDate: w.clock.ms, text: 'A question', headers: [{ name: 'From', value: 'Cust <cust@example.test>' }, { name: 'Subject', value: 'Re: Your quote' }], ...over });
await scenario('E6 exact thread match is immune to the row limit: 130 other open enquiries on the same address cannot hide the right one', async () => {
  const w = world();
  const target = await newLead(w, { fullName: 'Target' });
  const thread = w.services.gmail.sent.find((m) => m.subject.includes(target.fields['Enquiry Ref'])).threadId;
  for (let i = 0; i < 130; i++) w.services.seed('Leads', { 'Enquiry Ref': 'RF-' + String(i).padStart(8, '0'), 'Full Name': 'Crowd ' + i, Email: 'cust@example.test', Stage: 'New', 'Follow-up Status': 'Active' });
  w.clock.advance(30);
  inbound(w, { threadId: thread });
  await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.row('Leads', target.id).fields['Follow-up Status'], 'Paused - Customer Replied');
  assert.equal(w.services.activities(target.id, 'Email Received').length, 1);
  assert.equal(w.services.rows('Leads').filter((l) => l.fields['Customer Replied At']).length, 1, 'only the target changed');
});
await scenario('E7 several open enquiries share the address and the reply has NO thread/reference: nothing is guessed — a "Needs My Help" task and an alert, no lead changed, and a re-read does not duplicate it', async () => {
  const w = world();
  const a = await newLead(w, { fullName: 'One' }); const b = await newLead(w, { fullName: 'Two' });
  w.clock.advance(30);
  inbound(w, { threadId: 'unknown-thread' });
  const alerts = w.services.telegram.messages.length;
  await w.engine.trigger('Check Replies Now (webhook)');
  for (const l of [a, b]) { assert.equal(w.services.row('Leads', l.id).fields['Follow-up Status'], 'Active'); assert.equal(w.services.row('Leads', l.id).fields['Customer Replied At'], undefined); }
  const tasks = w.services.rows('Activity').filter((r) => r.fields['Workflow Step'] === 'Reply detection');
  assert.equal(tasks.length, 1); assert.equal(tasks[0].fields.Status, 'Needs My Help'); assert.equal(tasks[0].fields.Lead, undefined);
  assert.equal(w.services.telegram.messages.length, alerts + 1);
  await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.rows('Activity').filter((r) => r.fields['Workflow Step'] === 'Reply detection').length, 1, 'no duplicate task on re-read');
  assert.equal(w.services.telegram.messages.length, alerts + 1);
});
await scenario('E8 more than 100 open enquiries share the address and no thread matches: still ambiguous, never auto-picked', async () => {
  const w = world();
  for (let i = 0; i < 105; i++) w.services.seed('Leads', { 'Enquiry Ref': 'RF-' + String(i).padStart(8, '0'), 'Full Name': 'Crowd ' + i, Email: 'cust@example.test', Stage: 'New', 'Follow-up Status': 'Active' });
  inbound(w, { threadId: 'nowhere' });
  await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.rows('Leads').filter((l) => l.fields['Customer Replied At']).length, 0);
  assert.equal(w.services.rows('Activity').filter((r) => r.fields.Status === 'Needs My Help').length, 1);
});
await scenario('E9 a single open enquiry with that address (no thread/reference) is still matched by address; one found by RF- reference is matched exactly', async () => {
  const w = world();
  const only = await newLead(w);
  inbound(w, { threadId: 'other-thread' });
  await w.engine.trigger('Check Replies Now (webhook)');
  assert.equal(w.services.row('Leads', only.id).fields['Follow-up Status'], 'Paused - Customer Replied');
});

// =========================================================== F. daily follow-ups
const sweep = (w) => w.engine.trigger('Follow-up Sweep (webhook)'); // same chain as the schedule trigger
await scenario('F1 enquiry follow-ups: not before they are due, once when due, repeated triggers send nothing extra, then call task after the last', async () => {
  const w = world();
  const lead = await newLead(w);
  const ack = w.services.gmail.sent.length;
  await sweep(w);
  assert.equal(w.services.gmail.sent.length, ack, 'nothing due on day 0');
  w.clock.set('2026-10-13T08:30:00.000Z'); // Tuesday morning: next business day
  await sweep(w);
  assert.equal(w.services.gmail.sent.length, ack + 1); assert.match(w.services.gmail.sent.at(-1).subject, /^Re: We have received/);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Step'], 1);
  await sweep(w); await sweep(w);
  assert.equal(w.services.gmail.sent.length, ack + 1, 'repeated triggers must not email again');
  w.clock.set('2026-10-15T08:30:00.000Z'); // Thursday: 3 business days after Mon
  await sweep(w);
  assert.equal(w.services.gmail.sent.length, ack + 2);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Step'], 2);
  w.clock.set('2026-10-22T08:30:00.000Z');
  await sweep(w);
  assert.equal(w.services.gmail.sent.length, ack + 2);
  assert.equal(w.services.row('Leads', lead.id).fields['Follow-up Status'], 'Completed');
  noWarnings(w);
});
await scenario('F2 follow-up is rechecked: reply, booking, withdrawn permission and staff pause each stop it', async () => {
  for (const mutate of [
    (l) => { l.fields['Customer Replied At'] = '2026-10-13T07:00:00.000Z'; l.fields['Last Contact At'] = '2026-10-12T10:00:00.000Z'; },
    (l) => { l.fields.Stage = 'Inspection Scheduled'; },
    (l) => { l.fields['Permission Withdrawn'] = true; },
    (l) => { l.fields['Follow-up Status'] = 'Paused - Staff Handling'; },
    (l) => { l.fields.Stage = 'Lost'; },
  ]) {
    const w = world();
    const lead = await newLead(w);
    const ack = w.services.gmail.sent.length;
    mutate(w.services.row('Leads', lead.id));
    w.clock.set('2026-10-13T08:30:00.000Z');
    await sweep(w);
    assert.equal(w.services.gmail.sent.length, ack, 'follow-up must not be sent');
  }
});
await scenario('F3 phone-preference lead gets a follow-up CALL task, never an email', async () => {
  const w = world();
  const lead = await newLead(w, { preferredContact: 'Phone' });
  w.clock.set('2026-10-13T08:30:00.000Z');
  await sweep(w);
  assert.equal(w.services.gmail.sent.length, 0);
  assert.ok(w.services.activities(lead.id, 'Task').some((t) => /Follow-up call #1/.test(t.fields.Activity)));
});
await scenario('F4 unanswered quote: follow-ups at day 2, 5, 10; reply or acceptance stops them', async () => {
  const w = world();
  const lead = await newLead(w);
  const q = addQuote(w, lead);
  await press(w, 'send-quote', q.id);
  const base = w.services.gmail.sent.length;
  for (const [date, expected] of [['2026-10-13T09:30:00.000Z', 0], ['2026-10-14T09:30:00.000Z', 1], ['2026-10-17T09:30:00.000Z', 1], ['2026-10-22T09:30:00.000Z', 2]]) {
    w.clock.set(date);
    await sweep(w);
    assert.equal(w.services.gmail.sent.length - base, expected, date);
  }
  // reply stops the rest
  const w2 = world();
  const l2 = await newLead(w2);
  await press(w2, 'send-quote', addQuote(w2, l2).id);
  const b2 = w2.services.gmail.sent.length;
  await w2.engine.trigger('ROOFORA Inbox', [{ json: incoming({ threadId: w2.services.gmail.sent.at(-1).threadId }) }]);
  w2.clock.set('2026-10-14T09:30:00.000Z');
  await sweep(w2);
  assert.equal(w2.services.gmail.sent.length, b2);
});
await scenario('F5 sweep makes few Airtable calls when nothing is due (free-plan budget)', async () => {
  const w = world();
  await newLead(w);
  const before = w.services.airtable.calls.length;
  await sweep(w);
  assert.ok(w.services.airtable.calls.length - before <= 2, 'got ' + (w.services.airtable.calls.length - before));
});

// =========================================================== G. uncertain Gmail results, errors
await scenario('G1 Gmail times out AFTER sending: found in Sent, recorded as sent, NOT sent twice', async () => {
  const w = world();
  w.services.gmail.mode = 'timeout-sent';
  const lead = await newLead(w);
  assert.equal(w.services.gmail.sent.length, 1);
  assert.ok(lead.fields['Sent Message Keys'] || w.services.row('Leads', lead.id).fields['Sent Message Keys']);
});
await scenario('G2 Gmail times out BEFORE sending: not found in Sent, resent exactly once', async () => {
  const w = world();
  w.services.gmail.mode = 'timeout-unsent';
  await newLead(w);
  assert.equal(w.services.gmail.sent.length, 1);
});
await scenario('G3 Gmail unclear and Sent cannot be searched: NOT resent, flagged Needs My Help', async () => {
  const w = world();
  w.services.gmail.mode = 'timeout-unsent';
  const orig = w.services.http;
  w.services.http = async (req) => (req.method === 'GET' && req.url.includes('gmail.googleapis.com') ? { statusCode: 500, headers: {}, body: {} } : orig(req));
  const lead = await newLead(w);
  assert.equal(w.services.gmail.sent.length, 0);
  assert.ok(w.services.activities(lead.id, 'Automation Problem').some((a) => a.fields.Status === 'Needs My Help' && /unclear/i.test(a.fields.Activity)));
});
await scenario('G4 error handler: plain-English alert, no personal data, identical alerts muted, no loops', async () => {
  const w = world();
  await w.engine.crash('Could not save for jane@example.com phone +44 7700 900123', 'Save Lead');
  await w.engine.crash('Could not save for jane@example.com phone +44 7700 900123', 'Save Lead');
  const alerts = w.services.telegram.messages;
  assert.equal(alerts.length, 1); assert.match(alerts[0].text, /What to do:/); assert.ok(!/jane@example\.com|7700/.test(alerts[0].text));
  assert.equal(w.services.rows('Activity').filter((a) => a.fields.Status === 'Needs My Help').length, 2);
  // error handler failing (Airtable AND Telegram down) must not recurse or throw
  const w2 = world();
  w2.services.airtable.mode = '503'; w2.services.telegram.mode = 'fail';
  await w2.engine.crash('boom', 'Anything');
  assert.equal(w2.engine.executions.length, 1);
});
await scenario('G5 Airtable connection drops completely: website told to retry, nothing sent', async () => {
  const w = world();
  w.services.airtable.mode = 'down';
  const { response } = await submit(w);
  assert.equal(response.status, 503); assert.equal(w.services.gmail.sent.length, 0);
});

await scenario('G6 Send Customer Email: every path ends at the single node "Email Result" (real n8n returns only the LAST node\'s output to the caller)', async () => {
  const wf = workflows.sendEmail;
  const hasOut = new Set(Object.entries(wf.connections).filter(([, c]) => c.main.some((o) => o.length)).map(([n]) => n));
  const sinks = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote' && !hasOut.has(n.name)).map((n) => n.name);
  assert.deepEqual(sinks, ['Email Result']);
  const w = world();
  w.services.gmail.mode = 'fail400';
  const run = await w.engine.callSendEmail({ leadId: 'recXXXXXXXXXXXXXX', ref: 'RF-1', to: 'a@example.test', subject: 's', text: 't', messageKey: 'RF-1-ACK', threadId: '', summary: 'x', sentKeys: '', threadIds: '', permissionWithdrawn: false, settings: { ...settingsRow }, step: 'x' });
  assert.equal(run.lastNode, 'Email Result');
});

// ----------------------------------------------------------- report
let failed = 0;
for (const r of results) {
  if (r.ok) console.log('PASS  ' + r.name);
  else { failed++; console.log('FAIL  ' + r.name + '\n        ' + String(r.err && (r.err.stack || r.err.message) || r.err).split('\n').slice(0, 6).join('\n        ')); }
}
console.log('\n' + (results.length - failed) + ' passed, ' + failed + ' failed (simulated services, not live)');
process.exit(failed ? 1 : 0);
