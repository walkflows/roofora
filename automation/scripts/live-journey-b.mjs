// Live journey B: inspections (staff buttons), calendar events, reschedule, cancel, clash, and reminder scheduling.
import { webhook, harness } from './live-lib.mjs';
import { cfg, site, enquiryBody, refOf, leadByRef, rec, activityFor, sentMail, executionsSince, telegramFrom, ok, loadState, saveState, sleep, evidence, atList, atPatch, atCreate } from './live-journey-lib.mjs';

const state = loadState();
const L = state.leads;
const t0 = new Date().toISOString();
evidence(`\n## Journey B — inspections (started ${t0})`);
const base = 'https://n8n.walkflow.tech';
const CAL = encodeURIComponent(cfg.testCalendarId);
const events = async () => (await harness('calendar', 'GET', `https://www.googleapis.com/calendar/v3/calendars/${CAL}/events?singleEvents=true&showDeleted=true&maxResults=100&timeMin=${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`)).body.items || [];
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '.000Z');

async function newInspection(lead, startIso) {
  const r = await atCreate(cfg, 'Inspections', { Inspection: 'FICTIONAL TEST inspection', Lead: [lead], Status: 'Requested', 'Proposed Start': startIso });
  return r.body.records[0].id;
}
async function openPage(action, record) {
  return webhook(`roofora/staff?action=${action}&record=${record}`, undefined, { method: 'GET', basic: true });
}
async function press(action, record) {
  return webhook('roofora/staff', { action, record }, { method: 'POST', basic: true, headers: { Origin: base } });
}
const text = (r) => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));

// ---- fresh lead for reschedule/cancel
const b1body = enquiryBody({ fullName: 'Rae Reschedule (fictional)' });
await site(b1body); await sleep(14000);
const b1 = (await leadByRef(refOf(b1body.submissionId)))[0];
state.leads.b1 = { id: b1.id, ref: refOf(b1body.submissionId) };

const now = Date.now();
const startA1 = iso(now + 24 * 3600e3 + 6 * 60e3);   // 24 h reminder due in ~6 min
const startA2 = iso(now + 2 * 3600e3 + 6 * 60e3);    // 2 h reminder due in ~6 min
const startB1 = iso(now + 24 * 3600e3 + 8 * 60e3);   // original time of the reschedule test
const insp = {};

// B1: confirmation page changes nothing; confirm books
insp.a1 = await newInspection(L.a1.id, startA1);
const page = await openPage('book-inspection', insp.a1);
ok('B1 staff page needs the staff password (no-auth call refused)', (await fetch(`${base}/webhook/roofora/staff?action=book-inspection&record=${insp.a1}`)).status === 401);
ok('B1 opening the Book page shows a confirmation form and changes nothing', page.status === 200 && /<form method="post">/.test(text(page)) && (await rec('Inspections', insp.a1)).fields.Status === 'Requested' && (await events()).filter((e) => e.status !== 'cancelled').length === 0, `HTTP ${page.status}`);
const cross = await webhook('roofora/staff', { action: 'book-inspection', record: insp.a1 }, { method: 'POST', basic: true, headers: { Origin: 'https://evil.example' } });
ok('B1 a confirm sent from another website origin is refused', cross.status === 403, `HTTP ${cross.status}`);
const booked = await press('book-inspection', insp.a1);
await sleep(8000);
const evs1 = (await events()).filter((e) => e.status !== 'cancelled');
const i1 = (await rec('Inspections', insp.a1)).fields;
ok('B1 booking: real Google Calendar event on the TEST calendar (Europe/London), Airtable Scheduled v1, lead Inspection Scheduled', booked.status === 200 && /booked/i.test(text(booked)) && evs1.length === 1 && i1.Status === 'Scheduled' && i1['Booking Version'] === 1 && i1['Calendar Event ID'] === evs1[0].id && (await rec('Leads', L.a1.id)).fields.Stage === 'Inspection Scheduled', `event="${evs1[0] && evs1[0].summary}" tz=${evs1[0] && evs1[0].start.timeZone} start=${evs1[0] && evs1[0].start.dateTime}`);
const m1 = await sentMail(`${L.a1.ref} inspection`);
ok('B1 confirmation email to the test inbox only', m1.length >= 1 && m1.every((m) => TEST_RE.test(m.to)) && m1.some((m) => /inspection is booked/i.test(m.subject)), m1.map((m) => m.subject).join(' | '));

// B2: pressing Book again is a no-op
const again = await press('book-inspection', insp.a1); await sleep(4000);
ok('B2 pressing Book twice: "Already booked", no second event, no second email', /Already booked/.test(text(again)) && (await events()).filter((e) => e.status !== 'cancelled').length === 1 && (await sentMail(`${L.a1.ref} "inspection is booked"`)).length <= 1, `HTTP ${again.status}`);

// B3: 2 h reminder candidate
insp.a2 = await newInspection(L.a2.id, startA2);
const bk2 = await press('book-inspection', insp.a2); await sleep(6000);
ok('B3 second inspection booked (2 h reminder test)', bk2.status === 200 && (await rec('Inspections', insp.a2)).fields.Status === 'Scheduled', `HTTP ${bk2.status}`);

// B4: phone-preference customer → task, no email
insp.a3 = await newInspection(L.a3.id, iso(now + 50 * 3600e3));
const mailsBefore = (await sentMail(L.a3.ref)).length;
const bk3 = await press('book-inspection', insp.a3); await sleep(6000);
const act3 = await activityFor(L.a3.id);
ok('B4 phone-preference customer: booked, call task to confirm, no customer email', bk3.status === 200 && act3.some((a) => a.fields.Type === 'Calendar' && a.fields.Status === 'Open' && /CALL the customer/.test(a.fields.Details || '')) && (await sentMail(L.a3.ref)).length === mailsBefore, `emails=${mailsBefore}`);

// B5: clash refused
const clash = await newInspection(L.a5.id, startA1); // same time as a1's booking
const rc = await press('book-inspection', clash); await sleep(3000);
ok('B5 overlapping booking refused with the reason, nothing created', rc.status === 409 && /clashes with/.test(text(rc)) && (await rec('Inspections', clash)).fields.Status === 'Requested', `HTTP ${rc.status}`);
// past time refused
const past = await newInspection(L.a5.id, iso(Date.now() - 3600e3));
ok('B5 a time in the past is refused', (await press('book-inspection', past)).status === 409);

// B6: reschedule + cancel
insp.b1 = await newInspection(b1.id, startB1);
await press('book-inspection', insp.b1); await sleep(7000);
const eventBefore = (await rec('Inspections', insp.b1)).fields['Calendar Event ID'];
await atPatch(cfg, 'Inspections', insp.b1, { 'Proposed Start': iso(now + 27 * 3600e3) });
const mv = await press('book-inspection', insp.b1); await sleep(8000);
const iB = (await rec('Inspections', insp.b1)).fields;
const evMoved = (await events()).find((e) => e.id === eventBefore);
ok('B6 reschedule: SAME calendar event moved, Booking Version 2, customer emailed "moved"', /moved/i.test(text(mv)) && iB['Booking Version'] === 2 && iB['Calendar Event ID'] === eventBefore && Boolean(evMoved) && Date.parse(evMoved.start.dateTime) === Date.parse(iso(now + 27 * 3600e3)), `version=${iB['Booking Version']} sameEvent=${iB['Calendar Event ID'] === eventBefore} newStart=${evMoved && evMoved.start.dateTime}`);
const cancel = await press('cancel-inspection', insp.b1); await sleep(7000);
const evCancelled = (await events()).find((e) => e.id === eventBefore);
ok('B6 cancel: calendar event cancelled, Airtable Cancelled, lead back to Contacting, customer emailed', /cancelled/i.test(text(cancel)) && evCancelled && evCancelled.status === 'cancelled' && (await rec('Inspections', insp.b1)).fields.Status === 'Cancelled' && (await rec('Leads', b1.id)).fields.Stage === 'Contacting', `event status=${evCancelled && evCancelled.status}`);
const mailsB1 = await sentMail(L.b1.ref);
ok('B6 emails for this customer: acknowledgement, booked, moved, cancelled — all to the test inbox', mailsB1.every((m) => TEST_RE.test(m.to)) && ['received your roofing enquiry', 'booked', 'moved', 'cancelled'].every((w) => mailsB1.some((m) => m.subject.includes(w))), mailsB1.map((m) => m.subject.replace(/\(.*$/, '').trim()).join(' | '));
const again2 = await press('cancel-inspection', insp.b1); await sleep(3000);
ok('B6 cancelling twice is a no-op', /Already cancelled/.test(text(again2)) && (await sentMail(`${L.b1.ref} cancelled`)).length === mailsB1.filter((m) => /cancelled/.test(m.subject)).length);

state.insp = insp; state.bTimes = { startA1, startA2, startB1, bookedAt: new Date().toISOString() };
saveState(state);
const ex = await executionsSince(state.leadManagerId, t0);
const tg = []; for (const e of ex.slice(0, 12)) tg.push(...(await telegramFrom(e.id)));
ok('B Telegram alerts for bookings/cancellation (message ids in n8n executions)', tg.length >= 4, `alerts=${tg.length}`);
evidence(`- n8n Lead Manager executions since ${t0}: ${ex.length}; statuses=${[...new Set(ex.map((e) => e.status))].join(',')}; waiting=${ex.filter((e) => e.status === 'waiting').length} (reminder timers stored in n8n); failed=${ex.filter((e) => e.status === 'error').length}`);
