// Restores the safe state after controlled live tests:
//  - cancels fictional inspections still Scheduled (clean test calendar), clears pending reminder timers in n8n
//  - Customer Emails Enabled = OFF, Test Mode = ON, demo opening hours (Mon–Fri 08:00–17:00), recipient/allowlist = test inbox
//  - deactivates every ROOFORA workflow incl. the temporary harness
import { n8n, findWorkflow, deactivate, webhook, harness } from './live-lib.mjs';
import { cfg, rec, atList, atPatch, loadState, sleep, evidence, ok, TEST_TO } from './live-journey-lib.mjs';

const state = loadState();
evidence(`\n## Restore safe state (${new Date().toISOString()})`);
const base = 'https://n8n.walkflow.tech';

// 1. cancel fictional inspections that are still Scheduled (needs the runtime workflows active; harmless emails go to the test inbox only)
const insp = await atList(cfg, 'Inspections', 'pageSize=100');
const live = insp.filter((i) => i.fields.Status === 'Scheduled');
for (const i of live) await webhook('roofora/staff', { action: 'cancel-inspection', record: i.id }, { method: 'POST', basic: true, headers: { Origin: base } });
await sleep(10000);
const still = (await atList(cfg, 'Inspections', 'pageSize=100')).filter((i) => i.fields.Status === 'Scheduled');
const CAL = encodeURIComponent(cfg.testCalendarId);
const evs = (await harness('calendar', 'GET', `https://www.googleapis.com/calendar/v3/calendars/${CAL}/events?singleEvents=true&maxResults=100&timeMin=${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`)).body.items || [];
ok('RESTORE fictional inspections cancelled; test calendar holds no active events', still.length === 0 && evs.filter((e) => e.status !== 'cancelled').length === 0, `cancelled now=${live.length}; still scheduled=${still.length}; active events=${evs.filter((e) => e.status !== 'cancelled').length}`);

// 2. clear waiting executions (stored reminder timers) of the ROOFORA Lead Manager
const lm = await findWorkflow('ROOFORA — Lead Manager');
const waiting = (await n8n('GET', `/executions?workflowId=${lm.id}&status=waiting&limit=100`)).data || [];
for (const w of waiting) await n8n('DELETE', '/executions/' + w.id);
const left = (await n8n('GET', `/executions?workflowId=${lm.id}&status=waiting&limit=100`)).data || [];
ok('RESTORE pending reminder timers cleared', left.length === 0, `deleted ${waiting.length} waiting execution(s)`);

// 3. settings
const sid = state.settingsId;
await atPatch(cfg, 'Settings', sid, { 'Customer Emails Enabled': false, 'Test Mode': true, 'Test Recipient Email': TEST_TO, 'Email Allowlist': TEST_TO, 'Opening Days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 'Opening Time': '08:00', 'Closing Time': '17:00', 'Business Timezone': 'Europe/London' });
const s = (await rec('Settings', sid)).fields;
ok('RESTORE Settings: Customer Emails Enabled OFF, Test Mode ON, hours Mon–Fri 08:00–17:00, Europe/London, recipient+allowlist = test inbox', s['Customer Emails Enabled'] === false && s['Test Mode'] === true && s['Opening Time'] === '08:00' && s['Closing Time'] === '17:00' && s['Opening Days'].length === 5 && s['Email Allowlist'] === TEST_TO && s['Test Recipient Email'] === TEST_TO && s['Sender Email'] === SENDER && s['Sender Name'] === 'ROOFORA Demo', `emails=${s['Customer Emails Enabled']} testMode=${s['Test Mode']}`);

// 4. deactivate everything
const names = ['ROOFORA — Lead Manager', 'ROOFORA — Send Customer Email', 'ROOFORA — Error Handler', 'ROOFORA — Airtable Setup Check', 'ROOFORA — Test Harness (TEMPORARY)'];
const states = [];
for (const n of names) { const w = await findWorkflow(n); if (!w) continue; if (w.active) await deactivate(w.id); states.push(n.replace('ROOFORA — ', '') + '=' + (await n8n('GET', '/workflows/' + w.id)).active); }
ok('RESTORE every ROOFORA workflow is inactive', states.every((x) => x.endsWith('=false')), states.join(', '));
