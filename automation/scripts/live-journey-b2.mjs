// Live journey B2: reschedule + cancel with non-overlapping slots (the first attempt in journey B overlapped another booking and was correctly refused).
import { webhook, harness } from './live-lib.mjs';
import { cfg, rec, sentMail, ok, loadState, saveState, sleep, evidence, atPatch, atCreate } from './live-journey-lib.mjs';

const state = loadState(); const b1 = state.leads.b1;
evidence(`\n## Journey B2 — reschedule & cancel (started ${new Date().toISOString()})`);
const base = 'https://n8n.walkflow.tech';
const CAL = encodeURIComponent(cfg.testCalendarId);
const events = async () => (await harness('calendar', 'GET', `https://www.googleapis.com/calendar/v3/calendars/${CAL}/events?singleEvents=true&showDeleted=true&maxResults=100&timeMin=${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`)).body.items || [];
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '.000Z');
const press = (action, record) => webhook('roofora/staff', { action, record }, { method: 'POST', basic: true, headers: { Origin: base } });
const text = (r) => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
const before = (await sentMail(b1.ref)).length;

const t = Date.now();
const r = await atCreate(cfg, 'Inspections', { Inspection: 'FICTIONAL TEST reschedule', Lead: [b1.id], Status: 'Requested', 'Proposed Start': iso(t + 30 * 3600e3) });
const id = r.body.records[0].id;
const first = await press('book-inspection', id); await sleep(8000);
const f1 = (await rec('Inspections', id)).fields; const eventId = f1['Calendar Event ID'];
ok('B6 booking at +30 h succeeds (v1)', first.status === 200 && f1.Status === 'Scheduled' && f1['Booking Version'] === 1 && Boolean(eventId), `version=${f1['Booking Version']}`);

await atPatch(cfg, 'Inspections', id, { 'Proposed Start': iso(t + 33 * 3600e3) });
const mv = await press('book-inspection', id); await sleep(9000);
const f2 = (await rec('Inspections', id)).fields; const evs = await events();
const moved = evs.find((e) => e.id === eventId);
ok('B6 reschedule: SAME calendar event moved, Booking Version 2, only one active event for it', /moved/i.test(text(mv)) && f2['Booking Version'] === 2 && f2['Calendar Event ID'] === eventId && Boolean(moved) && Date.parse(moved.start.dateTime) === Date.parse(iso(t + 33 * 3600e3)) && evs.filter((e) => e.id === eventId).length === 1, `version=${f2['Booking Version']} newStart=${moved && moved.start.dateTime}`);
const mails = await sentMail(b1.ref);
ok('B6 customer emailed "moved" (to the test inbox only)', mails.some((m) => /moved to/.test(m.subject)) && mails.every((m) => TEST_RE.test(m.to)), mails.map((m) => m.subject.replace(/^\[TEST for [^\]]+\] /, '').replace(/\(RF.*$/, '').trim()).join(' | '));

const cancel = await press('cancel-inspection', id); await sleep(9000);
const evc = (await events()).find((e) => e.id === eventId);
ok('B6 cancel: Google event cancelled, Airtable Cancelled, lead back to Contacting', /cancelled/i.test(text(cancel)) && evc && evc.status === 'cancelled' && (await rec('Inspections', id)).fields.Status === 'Cancelled' && (await rec('Leads', b1.id)).fields.Stage === 'Contacting', `event=${evc && evc.status}`);
const mails2 = await sentMail(b1.ref);
ok('B6 customer emailed "cancelled"; total new emails = booked + moved + cancelled', mails2.some((m) => /cancelled/.test(m.subject)) && mails2.length - before === 3, `new emails=${mails2.length - before}`);
const again = await press('cancel-inspection', id); await sleep(4000);
ok('B6 cancelling again is a no-op (no extra email)', /Already cancelled/.test(text(again)) && (await sentMail(b1.ref)).length === mails2.length);

// re-book after cancelling re-uses the same event id (no duplicate appointment)
const rebook = await press('book-inspection', id); await sleep(8000);
const evr = (await events()).filter((e) => e.id === eventId);
ok('B6 re-booking a cancelled inspection re-uses the same calendar event (no duplicate appointment)', rebook.status === 200 && evr.length === 1 && evr[0].status === 'confirmed', `events with id=${evr.length} status=${evr[0] && evr[0].status}`);
await press('cancel-inspection', id); // leave the calendar clean
state.insp.b2 = id; saveState(state);
