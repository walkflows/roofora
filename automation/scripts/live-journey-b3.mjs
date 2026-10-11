// Live journey B3: re-test the reminder timers + "reminder recorded" marker after the sub-workflow result fix.
// Frees the slots used earlier (cancels the two earlier test inspections), then books two fresh inspections whose
// 24 h / 2 h reminders fall due ~6 minutes from now. Verify afterwards with live-reminders.mjs --b3.
import { webhook } from './live-lib.mjs';
import { cfg, rec, ok, loadState, saveState, sleep, evidence, atCreate } from './live-journey-lib.mjs';
const state = loadState(); const L = state.leads;
evidence(`\n## Journey B3 — reminder timers after the fix (started ${new Date().toISOString()})`);
const base = 'https://n8n.walkflow.tech';
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '.000Z');
const press = (action, record) => webhook('roofora/staff', { action, record }, { method: 'POST', basic: true, headers: { Origin: base } });
for (const k of ['a1', 'a2', 'a3']) await press('cancel-inspection', state.insp[k]);
await sleep(8000);
const now = Date.now();
const mk = async (lead, start) => (await atCreate(cfg, 'Inspections', { Inspection: 'FICTIONAL TEST reminder', Lead: [lead], Status: 'Requested', 'Proposed Start': start })).body.records[0].id;
const i24 = await mk(L.a5.id, iso(now + 24 * 3600e3 + 6 * 60e3));
const i2 = await mk(L.a6.id, iso(now + 2 * 3600e3 + 6 * 60e3));
const r1 = await press('book-inspection', i24); const r2 = await press('book-inspection', i2);
await sleep(8000);
ok('B3 two fresh inspections booked (24 h and 2 h reminders due in ~6 min)', r1.status === 200 && r2.status === 200 && (await rec('Inspections', i24)).fields.Status === 'Scheduled' && (await rec('Inspections', i2)).fields.Status === 'Scheduled');
state.b3 = { i24, i2, ref24: L.a5.ref, ref2: L.a6.ref, bookedAt: new Date().toISOString() };
saveState(state);
