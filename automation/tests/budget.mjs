// Counts Airtable API calls per step of a typical journey (SIMULATED run of the real workflow JSON).
//   node automation/tests/budget.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServices } from './sim/services.mjs';
import { createEngine, createClock } from './sim/engine.mjs';
import { buildAll } from '../build/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'roofora.config.example.json'), 'utf8'));
cfg.airtableBaseId = 'appTESTBASE0000001'; cfg.workflowIds = { sendEmail: 'wfSend', errorHandler: 'wfError' };
const built = buildAll(cfg);
const workflows = Object.fromEntries(Object.entries(built).map(([k, w]) => [k, JSON.parse(JSON.stringify({ name: w.name, nodes: w.nodes, connections: w.connections, settings: w.settings }))]));
workflows.leadManager.settings.errorWorkflow = 'wfError';
const START = '2026-10-12T09:00:00.000Z';
const clock = createClock(START);
const services = createServices(clock, cfg.airtableBaseId);
services.seed('Settings', { Name: 's', 'Business Timezone': 'Europe/London', 'Opening Days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 'Opening Time': '08:00', 'Closing Time': '17:00', 'Inspection Duration Minutes': 60, 'Travel Buffer Minutes': 30, 'Default Owner': 'Office', 'Enquiry Follow-up Business Days': '1,3', 'Quote Follow-up Days': '2,5,10', 'Quote Link Valid Days': 30, Currency: 'GBP', 'Customer Emails Enabled': true, 'Test Mode': false, 'Sender Email': 'h@r.test', 'Website URL': 'https://r.test', 'Calendar ID': 'c@x' });
const engine = createEngine({ workflows, ids: { leadManager: 'wfMain', sendEmail: 'wfSend', errorHandler: 'wfError' }, services, clock });
const rows = [];
const count = async (label, fn) => { const b = services.airtable.calls.length; await fn(); rows.push([label, services.airtable.calls.length - b]); };

const sid = randomUUID();
const body = { contractVersion: 1, source: 'roofora-website', environment: 'development', enquiryRef: 'RF-' + sid.replace(/-/g, '').slice(0, 8).toUpperCase(), receivedAt: START, submissionId: sid, fullName: 'Test Customer', phone: '+447700900123', email: 'cust@example.test', propertyType: 'Residential', service: 'Roof Repair', town: 'Croydon', postcode: 'CR0 1AA', details: '', urgency: 'This week', preferredContact: 'Email', photoCount: 1, consent: { given: true, wording: 'w', version: 'v1', recordedAt: START } };
await count('Website enquiry (email preference), incl. acknowledgement', () => engine.webhook('Website Enquiry', { body }));
const lead = services.rows('Leads')[0];
await count('One roof photo', () => engine.webhook('Photo Upload', { body: { submissionId: sid, leadRecordId: lead.id, enquiryRef: body.enquiryRef, slot: 1, contentType: 'image/jpeg', dataBase64: Buffer.alloc(900, 7).toString('base64'), retry: false } }));
const insp = services.seed('Inspections', { Inspection: 'i', Lead: [lead.id], Status: 'Requested', 'Proposed Start': '2026-10-14T09:00:00.000Z' });
const press = (action, record) => engine.webhook('Staff Button (Confirm)', { headers: { origin: cfg.n8nBaseUrl }, body: { action, record } });
await count('Staff opens the Book page (confirmation screen)', () => engine.webhook('Staff Button (Open)', { query: { action: 'book-inspection', record: insp.id } }));
await count('Staff confirms: book inspection + email', () => press('book-inspection', insp.id));
const waits = () => engine.log.pendingWaits.filter((x) => x.node === 'Wait Until Reminder Time');
await count('24 h reminder (email)', async () => { const w = waits().at(-1); clock.set(w.until); await engine.resume('Wait Until Reminder Time', w.items, { 'Next Reminder': w.items }); });
await count('2 h reminder (email)', async () => { const w = waits().at(-1); clock.set(w.until); await engine.resume('Wait Until Reminder Time', w.items, { 'Next Reminder': w.items }); });
await count('Mark inspection completed', () => press('complete-inspection', insp.id));
const quote = services.seed('Quotes', { Quote: 'q', Lead: [lead.id], Version: 1, Scope: 'Replace slates and re-seal valley.', Amount: 640, Approved: true, 'Approved By': 'Sam', Status: 'Draft' });
await count('Send approved quote (email)', () => press('send-quote', quote.id));
const token = /quote\/([a-f0-9]{64})/.exec(services.gmail.sent.at(-1).text)[1];
await count('Customer opens quote page (view)', () => engine.webhook('Quote Link', { body: { action: 'view', token } }));
await count('Customer accepts quote (Won + job task + email)', () => engine.webhook('Quote Link', { body: { action: 'accept', token } }));
clock.set('2026-10-20T08:30:00.000Z');
await count('Daily sweep with nothing due', () => engine.trigger('Every Business Morning'));

const total = rows.reduce((n, r) => n + r[1], 0);
console.log('Airtable API calls per step (simulated run of the real workflows):\n');
for (const [l, n] of rows) console.log(String(n).padStart(3) + '  ' + l);
console.log('\n' + String(total).padStart(3) + '  TOTAL for one customer, enquiry → accepted quote (staff doing everything through the buttons)');
const perMonthSweeps = 26;
console.log('\nPlus the daily sweep: ' + perMonthSweeps + ' business mornings × 2 calls ≈ ' + perMonthSweeps * 2 + ' calls/month even with no customers.');
console.log('Free plan allowance (Airtable support page): 1,000 API calls/month → about ' + Math.floor((1000 - perMonthSweeps * 2) / total) + ' complete journeys/month.');
