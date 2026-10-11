// Offline logic tests for the ROOFORA Code-node libraries.
//   node automation/tests/logic.test.mjs
// These prove the decision logic only. They do NOT prove Airtable, Gmail,
// Calendar or Telegram work — see automation/docs/TEST-RESULTS.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'code', 'lib');
const src = ['core', 'intake', 'email', 'replies', 'staff', 'sweep', 'problems'].map((n) => readFileSync(join(dir, n + '.js'), 'utf8')).join('\n');
const names = 'str firstName af list numberList zonedParts zonedToUtc isValidTimeZone hoursFrom businessDayAt isWithinHours nextOpenMoment addDays addMinutes friendly addToList hasInList calendarEventId httpProblem ok readSettings checkEnquiryPayload postcodeMatches checkServiceArea qualifyLead leadFields pickWinner telegramNewLead customerEmail prepareEmail classifySend classifySearch classifyIncoming exactLookupFormula addressLookupFormula matchExact matchByAddress planUnmatched planReply readStaffRequest checkStaffOrigin planBooking findConflicts classifyCalendarSave reminderTimes reminderStillDue planQuoteSend planQuoteAnswer quoteAnswerBlocked quoteView planFollowUp dueLeadsFormula describeProblem shouldAlert scrub'.split(' ');
const L = new Function('Buffer', src + '\nreturn {' + names.join(',') + '};')(Buffer);

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(name + ' — ' + e.message);
  }
}

const settings = {
  'Business Timezone': 'Europe/London', 'Opening Days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 'Opening Time': '08:00', 'Closing Time': '17:00',
  'Inspection Duration Minutes': 60, 'Travel Buffer Minutes': 30, 'Service Area Postcode Prefixes': 'SW, SE1, CR0', 'Service Area Towns': 'London\nCroydon',
  'Default Owner': 'Office', 'Urgent Owner': 'Dispatcher', 'Enquiry Follow-up Business Days': '1,3', 'Quote Follow-up Days': '2,5,10', 'Quote Link Valid Days': 30,
  Currency: 'GBP', 'Customer Emails Enabled': true, 'Test Mode': false, 'Sender Email': 'hello@roofora.test', 'Business Name': 'ROOFORA', 'Calendar ID': 'cal@group.calendar.google.com',
  'Website URL': 'https://roofora.test',
};
const sid = '3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f';
const payload = (over = {}) => ({
  contractVersion: 1, source: 'roofora-website', environment: 'development', enquiryRef: 'RF-3F2B8C1E', receivedAt: '2026-10-12T09:00:00Z', submissionId: sid,
  fullName: 'Test Customer', phone: '+447700900123', email: 'cust@example.test', propertyType: 'Residential', service: 'Roof Repair', town: 'Croydon', postcode: 'CR0 1AA',
  details: 'Slate missing', urgency: 'This week', preferredContact: 'Email', photoCount: 0,
  consent: { given: true, wording: 'I agree', version: 'contact-permission-v1', recordedAt: '2026-10-12T09:00:00Z' }, ...over,
});

// ---- intake validation ----
test('valid payload accepted', () => assert.equal(L.checkEnquiryPayload(payload()).valid, true));
test('email required for Email preference', () => assert.ok(L.checkEnquiryPayload(payload({ email: '' })).errors.email));
test('email optional for Phone preference', () => assert.equal(L.checkEnquiryPayload(payload({ email: '', preferredContact: 'Phone' })).valid, true));
test('SMS preference rejected', () => assert.ok(L.checkEnquiryPayload(payload({ preferredContact: 'SMS' })).errors.preferredContact));
test('missing consent rejected', () => assert.ok(L.checkEnquiryPayload(payload({ consent: { given: false } })).errors.consent));
test('unexpected field rejected', () => assert.ok(L.checkEnquiryPayload(payload({ admin: true })).errors._unexpected));
test('reference must match submission id', () => assert.ok(L.checkEnquiryPayload(payload({ enquiryRef: 'RF-00000000' })).errors.enquiryRef));
test('bad photo count rejected', () => assert.ok(L.checkEnquiryPayload(payload({ photoCount: 4 })).errors.photos));
test('international phone accepted, junk rejected', () => {
  assert.equal(L.checkEnquiryPayload(payload({ phone: '+2348012345678' })).valid, true);
  assert.ok(L.checkEnquiryPayload(payload({ phone: '12' })).errors.phone);
});

// ---- service area ----
test('SW10 does not match prefix SW1 boundary but SW matches', () => {
  assert.equal(L.postcodeMatches('SE10 1AA', 'SE1'), false);
  assert.equal(L.postcodeMatches('SE1 7PB', 'SE1'), true);
  assert.equal(L.postcodeMatches('SW19 5AA', 'SW'), true);
});
test('in-area postcode', () => assert.equal(L.checkServiceArea('Anywhere', 'CR0 1AA', settings).area, 'In Area'));
test('unknown location is flagged, never rejected', () => {
  const a = L.checkServiceArea('Leeds', 'LS1 1AA', settings).area;
  assert.ok(['Possibly Out of Area', 'Needs Review'].includes(a));
  assert.equal(L.checkServiceArea('Leeds', '', settings).area, 'Needs Review');
});
test('no area configured → Not Checked', () => assert.equal(L.checkServiceArea('X', 'Y', {}).area, 'Not Checked'));

// ---- qualification ----
const monday9 = new Date('2026-10-12T09:00:00Z'); // Monday
test('urgent: priority callback, urgent owner, due now, no promise', () => {
  const d = L.checkEnquiryPayload(payload({ urgency: 'Urgent active leak/storm damage', preferredContact: 'Phone' })).data;
  const q = L.qualifyLead(d, settings, monday9);
  assert.equal(q.priority, 'Urgent'); assert.equal(q.owner, 'Dispatcher'); assert.equal(q.callbackTask, true); assert.equal(q.sendAcknowledgement, false);
  assert.equal(q.nextActionDue, monday9.toISOString()); assert.ok(!/will attend|visit you/i.test(q.nextAction));
});
test('phone preference with optional email still gets NO email', () => {
  const d = L.checkEnquiryPayload(payload({ preferredContact: 'Phone' })).data;
  assert.equal(L.qualifyLead(d, settings, monday9).sendAcknowledgement, false);
});
test('email preference gets acknowledgement, not callback', () => {
  const q = L.qualifyLead(L.checkEnquiryPayload(payload()).data, settings, monday9);
  assert.equal(q.sendAcknowledgement, true); assert.equal(q.callbackTask, false);
});
test('stage and urgency are separate fields', () => {
  const d = L.checkEnquiryPayload(payload({ urgency: 'Urgent active leak/storm damage' })).data;
  const f = L.leadFields(d, L.qualifyLead(d, settings, monday9));
  assert.equal(f.Stage, 'New'); assert.equal(f.Priority, 'Urgent'); assert.equal(f.Urgency, 'Urgent active leak/storm damage');
  assert.equal(f['Contact Permission'], true); assert.ok(f['Permission Wording'] && f['Permission Version'] && f['Permission Recorded At']);
});
test('duplicate winner is the earliest, deterministic', () => {
  const w = L.pickWinner([{ id: 'recB', createdTime: '2026-10-12T09:00:01Z' }, { id: 'recA', createdTime: '2026-10-12T09:00:01Z' }, { id: 'recC', createdTime: '2026-10-12T09:00:05Z' }]);
  assert.equal(w.id, 'recA');
});

// ---- time zones / business days ----
test('weekend → next Monday opening in London (BST)', () => {
  const h = L.hoursFrom(settings);
  const sat = new Date('2026-10-10T10:00:00Z');
  assert.equal(L.nextOpenMoment(sat, h).toISOString(), '2026-10-12T07:00:00.000Z'); // 08:00 BST
});
test('business day arithmetic skips weekend', () => {
  const h = L.hoursFrom(settings);
  assert.equal(L.businessDayAt(new Date('2026-10-16T12:00:00Z'), 1, h).toISOString(), '2026-10-19T07:00:00.000Z'); // Fri → Mon
});
test('DST change handled (clocks go back 25 Oct 2026)', () => {
  const h = L.hoursFrom(settings);
  assert.equal(L.businessDayAt(new Date('2026-10-23T12:00:00Z'), 1, h).toISOString(), '2026-10-26T08:00:00.000Z'); // Mon 08:00 GMT
});
test('different business timezone gives different instants', () => {
  const h = L.hoursFrom({ ...settings, 'Business Timezone': 'America/New_York' });
  assert.equal(L.businessDayAt(new Date('2026-10-12T12:00:00Z'), 0, h).toISOString(), '2026-10-12T12:00:00.000Z');
});
test('invalid timezone falls back to UTC with a problem message', () => {
  const r = L.readSettings({ statusCode: 200, body: { records: [{ id: 'recX', fields: { ...settings, 'Business Timezone': 'Lagos' } }] } });
  assert.equal(r.settings['Business Timezone'], 'UTC'); assert.equal(r.problems.length, 1);
});
test('unreadable settings never allow customer email', () => {
  const r = L.readSettings({ statusCode: 500, body: {} });
  assert.equal(r.settings['Customer Emails Enabled'], false);
});

// ---- email safety ----
const mailIn = (over = {}) => ({ settings, to: 'cust@example.test', subject: 'Hi', text: 'Body', messageKey: 'RF-3F2B8C1E-ACK', permissionWithdrawn: false, ...over });
test('master switch off blocks sending', () => assert.equal(L.prepareEmail(mailIn({ settings: { ...settings, 'Customer Emails Enabled': false } })).send, false));
test('test mode redirects every email and tags the subject', () => {
  const p = L.prepareEmail(mailIn({ settings: { ...settings, 'Test Mode': true, 'Test Recipient Email': 'joshua@example.test' } }));
  assert.equal(p.to, 'joshua@example.test'); assert.match(p.subject, /^\[TEST for cust@example\.test\]/);
});
test('test mode without a test inbox sends nothing', () => assert.equal(L.prepareEmail(mailIn({ settings: { ...settings, 'Test Mode': true } })).send, false));
test('allowlist: only listed addresses can ever receive mail, even with Test Mode off or after the test redirect', () => {
  const al = { ...settings, 'Email Allowlist': 'me@example.test\nother@example.test' };
  assert.equal(L.prepareEmail(mailIn({ settings: al })).send, false);
  assert.equal(L.prepareEmail(mailIn({ settings: al, to: 'ME@example.test' })).send, true);
  assert.equal(L.prepareEmail(mailIn({ settings: { ...al, 'Test Mode': true, 'Test Recipient Email': 'me@example.test' } })).to, 'me@example.test');
  assert.equal(L.prepareEmail(mailIn({ settings: { ...al, 'Test Mode': true, 'Test Recipient Email': 'stranger@example.test' } })).send, false);
});
test('withdrawn permission blocks sending', () => assert.equal(L.prepareEmail(mailIn({ permissionWithdrawn: true })).send, false));
test('bad address blocks sending', () => assert.equal(L.prepareEmail(mailIn({ to: 'nope' })).send, false));
test('raw message is base64url and carries the message key for later lookup', () => {
  const p = L.prepareEmail(mailIn({ text: L.customerEmail('ack', { fullName: 'A B', enquiryRef: 'RF-3F2B8C1E', service: 'Roof Repair', town: 'X', urgent: false, messageKey: 'RF-3F2B8C1E-ACK' }, settings).text }));
  assert.match(p.raw, /^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(p.raw, 'base64url').toString('utf8');
  assert.match(decoded, /^From: ROOFORA <hello@roofora\.test>/m);
  assert.match(Buffer.from(decoded.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8'), /RF-3F2B8C1E-ACK/);
});
test('urgent acknowledgement does not promise an emergency visit', () => {
  const m = L.customerEmail('ack', { fullName: 'A', enquiryRef: 'RF-1', service: 'Roof Repair', town: 'X', urgent: true, messageKey: 'k' }, settings);
  assert.match(m.text, /does not confirm an emergency visit/);
});
test('send classification: 200 sent, 5xx/timeout uncertain, 400 failed', () => {
  assert.equal(L.classifySend({ statusCode: 200, body: { id: 'm1', threadId: 't1' } }).status, 'sent');
  assert.equal(L.classifySend({ statusCode: 503, body: {} }).status, 'uncertain');
  assert.equal(L.classifySend({ statusCode: undefined, body: {} }).status, 'uncertain');
  assert.equal(L.classifySend({ statusCode: 400, body: { error: { message: 'bad' } } }).status, 'failed');
});
test('search after uncertain send', () => {
  assert.equal(L.classifySearch({ statusCode: 200, body: { messages: [{ id: 'm', threadId: 't' }] } }).found, true);
  assert.equal(L.classifySearch({ statusCode: 200, body: {} }).found, false);
  assert.equal(L.classifySearch({ statusCode: 500, body: {} }).found, null);
});

// ---- reply detection ----
const inbound = (over = {}) => ({ id: 'g1', threadId: 'th1', subject: 'Re: We have received your roofing enquiry (RF-3F2B8C1E)', text: 'Thursday suits me', from: { value: [{ address: 'Cust@Example.test' }] }, headers: {}, ...over });
test('customer reply recognised and referenced', () => {
  const c = L.classifyIncoming(inbound(), 'hello@roofora.test');
  assert.equal(c.kind, 'reply'); assert.equal(c.ref, 'RF-3F2B8C1E'); assert.equal(c.from, 'cust@example.test');
});
test('bounce recognised', () => assert.equal(L.classifyIncoming(inbound({ subject: 'Delivery Status Notification (Failure)', from: { value: [{ address: 'mailer-daemon@googlemail.com' }] } }), '').kind, 'bounce'));
test('auto-replies recognised (header and subject)', () => {
  assert.equal(L.classifyIncoming(inbound({ headers: { 'Auto-Submitted': 'auto-replied' } }), '').kind, 'auto-reply');
  assert.equal(L.classifyIncoming(inbound({ subject: 'Automatic reply: Out of office' }), '').kind, 'auto-reply');
});
test('STOP withdraws permission', () => assert.equal(L.classifyIncoming(inbound({ text: 'STOP\n\n> quoted' }), '').kind, 'stop'));
test('newsletters and bulk mail are skipped before any Airtable lookup', () => {
  assert.equal(L.classifyIncoming(inbound({ headers: { 'List-Unsubscribe': '<mailto:x@y.test>' } }), '').kind, 'ignore');
  assert.equal(L.classifyIncoming(inbound({ headers: { Precedence: 'bulk' } }), '').kind, 'ignore');
});
test('our own mail ignored', () => assert.equal(L.classifyIncoming(inbound({ from: { value: [{ address: 'hello@roofora.test' }] } }), 'hello@roofora.test').kind, 'ignore'));
test('lead matching: exact thread/reference first; address only when exactly one open lead; ambiguity never guessed', () => {
  const lead = (id, over) => ({ id, fields: { 'Enquiry Ref': 'RF-' + id, Email: 'a@x.test', Stage: 'New', 'Gmail Thread IDs': '', ...over } });
  assert.equal(L.matchExact([lead('AAAAAAAA', { 'Gmail Thread IDs': 'th1' })], { threadId: 'th1', from: 'q@q.test' }).how, 'thread');
  assert.equal(L.matchExact([lead('AAAAAAAA')], { threadId: 'zz', ref: 'RF-AAAAAAAA', from: 'q@q.test' }).how, 'reference');
  assert.equal(L.matchExact([lead('AAAAAAAA')], { threadId: 'zz', from: 'a@x.test' }), null);
  assert.deepEqual(L.matchExact([lead('AAAAAAAA', { 'Gmail Thread IDs': 'th1' }), lead('BBBBBBBB', { 'Gmail Thread IDs': 'th1' })], { threadId: 'th1' }).ambiguous, ['RF-AAAAAAAA', 'RF-BBBBBBBB']);
  assert.equal(L.matchExact([lead('AAAAAAAA', { 'Gmail Thread IDs': 'th10' })], { threadId: 'th1' }), null); // a longer id must not match a shorter one
  assert.equal(L.matchByAddress([lead('AAAAAAAA')], { from: 'a@x.test' }).how, 'sender address (only one open enquiry)');
  assert.deepEqual(L.matchByAddress([lead('AAAAAAAA'), lead('BBBBBBBB')], { from: 'a@x.test' }).ambiguous, ['RF-AAAAAAAA', 'RF-BBBBBBBB']);
  assert.equal(L.matchByAddress([lead('AAAAAAAA', { Stage: 'Won' })], { from: 'a@x.test' }), null);
});
test('lookups are exact: thread/reference only; address lookup is separate, open leads only, never for bounces', () => {
  const ex = L.exactLookupFormula({ threadId: 't1', ref: 'RF-AAAAAAAA', from: 'a@x.test' });
  assert.ok(/FIND\('t1'/.test(ex) && /RF-AAAAAAAA/.test(ex) && !/LOWER/.test(ex));
  assert.equal(L.exactLookupFormula({ from: 'a@x.test' }), null);
  assert.ok(/LOWER/.test(L.addressLookupFormula({ kind: 'reply', from: 'a@x.test' })) && /Won/.test(L.addressLookupFormula({ kind: 'reply', from: 'a@x.test' })));
  assert.equal(L.addressLookupFormula({ kind: 'bounce', from: 'a@x.test' }), null);
});
test('an unmatchable reply becomes a staff task, not a guess', () => {
  const u = L.planUnmatched({ kind: 'reply', from: 'a@x.test', subject: 'Re: quote', messageId: 'm1' }, ['RF-1', 'RF-2'], new Date());
  assert.equal(u.activity.Status, 'Needs My Help');
  assert.equal(u.activity.Lead, undefined);
  assert.ok(/RF-1, RF-2/.test(u.activity.Details) && /did not guess/.test(u.alert));
});
test('reply pauses follow-ups; auto-reply does not; bounce pauses; stop withdraws', () => {
  const lead = { id: 'recL', fields: { 'Enquiry Ref': 'RF-1', 'Follow-up Status': 'Active', Owner: 'Office', 'Full Name': 'A' } };
  const now = new Date();
  assert.equal(L.planReply({ kind: 'reply', messageId: 'g', subject: 's', snippet: 'hi' }, lead, now).leadPatch['Follow-up Status'], 'Paused - Customer Replied');
  assert.equal(L.planReply({ kind: 'auto-reply', messageId: 'g', subject: 's' }, lead, now).leadPatch['Follow-up Status'], undefined);
  assert.equal(L.planReply({ kind: 'bounce', messageId: 'g', subject: 's' }, lead, now).leadPatch['Follow-up Status'], 'Paused - Email Bounced');
  assert.equal(L.planReply({ kind: 'stop', messageId: 'g', subject: 's' }, lead, now).leadPatch['Permission Withdrawn'], true);
});

// ---- follow-ups: rechecked against the CURRENT lead ----
const fuLead = (over = {}) => ({ id: 'recL', fields: { 'Enquiry Ref': 'RF-3F2B8C1E', 'Full Name': 'A B', Email: 'a@x.test', Phone: '+4477', 'Preferred Contact': 'Email', Stage: 'New', 'Follow-up Status': 'Active', 'Follow-up Kind': 'Enquiry', 'Follow-up Step': 0, 'Received At': '2026-10-12T09:00:00Z', 'Follow-up Base At': '2026-10-12T09:00:00Z', ...over } });
const tue = new Date('2026-10-13T08:00:00Z');
test('first enquiry follow-up emails and schedules the next', () => {
  const p = L.planFollowUp(fuLead(), settings, tue);
  assert.equal(p.action, 'email'); assert.equal(p.step, 1); assert.ok(p.leadPatch['Next Follow-up At']); assert.equal(p.messageKey, 'RF-3F2B8C1E-FU-ENQUIRY-1');
});
test('phone preference gets a call task, never an email', () => assert.equal(L.planFollowUp(fuLead({ 'Preferred Contact': 'Phone' }), settings, tue).action, 'task'));
test('withdrawn permission stops', () => assert.equal(L.planFollowUp(fuLead({ 'Permission Withdrawn': true }), settings, tue).action, 'stop'));
test('stage moved on stops', () => assert.equal(L.planFollowUp(fuLead({ Stage: 'Inspection Scheduled' }), settings, tue).action, 'stop'));
test('paused by staff is skipped', () => assert.equal(L.planFollowUp(fuLead({ 'Follow-up Status': 'Paused - Staff Handling' }), settings, tue).action, 'skip'));
test('reply after our last contact stops', () => assert.equal(L.planFollowUp(fuLead({ 'Customer Replied At': '2026-10-13T07:00:00Z', 'Last Contact At': '2026-10-12T10:00:00Z' }), settings, tue).leadPatch['Follow-up Status'], 'Paused - Customer Replied'));
test('already-sent key is not sent again', () => assert.equal(L.planFollowUp(fuLead({ 'Sent Message Keys': 'RF-3F2B8C1E-FU-ENQUIRY-1' }), settings, tue).action, 'stop-dup'));
test('after the last step the schedule completes with a staff task', () => assert.equal(L.planFollowUp(fuLead({ 'Follow-up Step': 2 }), settings, tue).action, 'complete'));
test('quote follow-ups only while Quote Sent', () => {
  assert.equal(L.planFollowUp(fuLead({ 'Follow-up Kind': 'Quote', Stage: 'Quote Sent' }), settings, tue).action, 'email');
  assert.equal(L.planFollowUp(fuLead({ 'Follow-up Kind': 'Quote', Stage: 'Won' }), settings, tue).action, 'stop');
});

// ---- inspection booking ----
const insp = (over = {}) => ({ id: 'recInspAAAAAAAAAA', fields: { Inspection: 'x', Status: 'Requested', 'Proposed Start': '2026-10-14T09:00:00Z', ...over } });
const lead = { id: 'recLeadAAAAAAAAAA', fields: { 'Enquiry Ref': 'RF-1' } };
test('valid booking planned inside hours', () => {
  const p = L.planBooking(insp(), lead, settings, monday9);
  assert.equal(p.go, true); assert.equal(p.newVersion, 1); assert.equal(p.end, '2026-10-14T10:00:00.000Z'); assert.match(p.eventId, /^[a-v0-9]+$/);
});
test('outside opening hours refused', () => assert.equal(L.planBooking(insp({ 'Proposed Start': '2026-10-14T20:00:00Z' }), lead, settings, monday9).go, false));
test('weekend refused', () => assert.equal(L.planBooking(insp({ 'Proposed Start': '2026-10-17T09:00:00Z' }), lead, settings, monday9).go, false));
test('past time refused', () => assert.equal(L.planBooking(insp({ 'Proposed Start': '2026-10-12T08:00:00Z' }), lead, settings, monday9).go, false));
test('pressing Book twice for the same time changes nothing', () => {
  const p = L.planBooking(insp({ Status: 'Scheduled', 'Confirmed Start': '2026-10-14T09:00:00.000Z', 'Booking Version': 1 }), lead, settings, monday9);
  assert.equal(p.go, false); assert.equal(p.unchanged, true);
});
test('moving a booking bumps the version and reuses the event', () => {
  const p = L.planBooking(insp({ Status: 'Scheduled', 'Confirmed Start': '2026-10-14T09:00:00.000Z', 'Booking Version': 1, 'Proposed Start': '2026-10-15T10:00:00Z', 'Calendar Event ID': 'rfiabc' }), lead, settings, monday9);
  assert.equal(p.go, true); assert.equal(p.isMove, true); assert.equal(p.newVersion, 2); assert.equal(p.eventId, 'rfiabc');
});
test('calendar clash detected; own event and transparent events ignored; read failure blocks', () => {
  const ev = (o) => ({ id: 'other', status: 'confirmed', summary: 'Other job', start: { dateTime: '2026-10-14T09:30:00Z' }, ...o });
  assert.equal(L.findConflicts({ statusCode: 200, body: { items: [ev()] } }, 'mine', 'UTC').free, false);
  assert.equal(L.findConflicts({ statusCode: 200, body: { items: [ev({ id: 'mine' }), ev({ transparency: 'transparent' })] } }, 'mine', 'UTC').free, true);
  assert.equal(L.findConflicts({ statusCode: 500, body: {} }, 'mine', 'UTC').checked, false);
});
test('calendar save: 409 on insert means patch, other errors do not confirm', () => {
  assert.equal(L.classifyCalendarSave({ statusCode: 409, body: {} }, true).retryAsPatch, true);
  assert.equal(L.classifyCalendarSave({ statusCode: 500, body: {} }, true).saved, false);
  assert.equal(L.classifyCalendarSave({ statusCode: 200, body: { id: 'e' } }, true).saved, true);
});
test('reminders: 24h and 2h planned, past ones skipped', () => {
  const r = L.reminderTimes('2026-10-14T09:00:00Z', monday9);
  assert.equal(r.at24, '2026-10-13T09:00:00.000Z'); assert.equal(r.at2, '2026-10-14T07:00:00.000Z');
  assert.equal(L.reminderTimes('2026-10-12T10:00:00Z', monday9).at24, null);
});
test('stale reminder is dropped when the booking changed, was cancelled, or already sent', () => {
  const base = { Status: 'Scheduled', 'Booking Version': 2, 'Confirmed Start': '2026-10-14T09:00:00Z' };
  const now = new Date('2026-10-13T09:00:00Z');
  assert.equal(L.reminderStillDue({ fields: base }, 2, '24h', now).due, true);
  assert.equal(L.reminderStillDue({ fields: { ...base, 'Booking Version': 3 } }, 2, '24h', now).due, false);
  assert.equal(L.reminderStillDue({ fields: { ...base, Status: 'Cancelled' } }, 2, '24h', now).due, false);
  assert.equal(L.reminderStillDue({ fields: { ...base, 'Reminder 24h Sent Version': 2 } }, 2, '24h', now).due, false);
  assert.equal(L.reminderStillDue({ fields: base }, 2, '2h', new Date('2026-10-14T08:30:00Z')).due, false);
});

// ---- quotes ----
const quote = (over = {}) => ({ id: 'recQuoteAAAAAAAAA', fields: { Quote: 'q', Version: 1, Scope: 'Replace 12 slates and re-seal valley', Amount: 640, Approved: true, 'Approved By': 'Sam', Status: 'Draft', ...over } });
const qlead = { id: 'recLeadAAAAAAAAAA', fields: { 'Enquiry Ref': 'RF-1', 'Full Name': 'A B', Email: 'a@x.test', 'Preferred Contact': 'Email', Stage: 'Inspection Completed' } };
test('unapproved quote cannot be sent', () => {
  assert.equal(L.planQuoteSend(quote({ Approved: false }), qlead, settings, monday9).go, false);
  assert.equal(L.planQuoteSend(quote({ 'Approved By': '' }), qlead, settings, monday9).go, false);
});
test('incomplete quote cannot be sent', () => {
  assert.equal(L.planQuoteSend(quote({ Amount: 0 }), qlead, settings, monday9).go, false);
  assert.equal(L.planQuoteSend(quote({ Scope: 'x' }), qlead, settings, monday9).go, false);
});
test('approved draft is sendable; already-sent is a no-op', () => {
  const p = L.planQuoteSend(quote(), qlead, settings, monday9);
  assert.equal(p.go, true); assert.equal(p.byEmail, true); assert.equal(p.messageKey, 'RF-1-Q1');
  assert.equal(L.planQuoteSend(quote({ Status: 'Sent', 'Sent At': 'x' }), qlead, settings, monday9).unchanged, true);
});
test('quote email carries amount, scope, link and no date promise', () => {
  const m = L.customerEmail('quote', { fullName: 'A B', enquiryRef: 'RF-1', version: 1, scope: 'Scope text', amountText: '£640.00', link: 'https://roofora.test/quote/' + 'a'.repeat(64), validUntilText: '11 November 2026', messageKey: 'RF-1-Q1' }, settings);
  assert.match(m.text, /£640\.00/); assert.match(m.text, /Scope text/); assert.match(m.text, /does not book a date/);
});
const sentQuote = (over = {}) => quote({ Status: 'Sent', 'Link Expires At': '2026-11-11T00:00:00Z', ...over });
test('accepting: Won, follow-ups completed, job task, no date promised', () => {
  const p = L.planQuoteAnswer(sentQuote(), qlead, 'accept', false, monday9, settings);
  assert.equal(p.leadPatch.Stage, 'Won'); assert.equal(p.leadPatch['Follow-up Status'], 'Completed'); assert.match(p.task.Details, /agree a job date|agree a date/i);
  assert.match(p.leadPatch['Next Action'], /not yet promised/); assert.equal(p.quotePatch['Customer Response'], 'Accepted online');
});
test('answering twice is idempotent; wrong answer after decision is refused', () => {
  assert.equal(L.planQuoteAnswer(quote({ Status: 'Accepted' }), qlead, 'accept', false, monday9, settings).same, true);
  assert.equal(L.planQuoteAnswer(quote({ Status: 'Accepted' }), qlead, 'decline', false, monday9, settings).go, false);
});
test('superseded and expired quotes cannot be accepted', () => {
  assert.equal(L.planQuoteAnswer(quote({ Status: 'Superseded' }), qlead, 'accept', false, monday9, settings).go, false);
  assert.equal(L.planQuoteAnswer(sentQuote({ 'Link Expires At': '2026-10-01T00:00:00Z' }), qlead, 'accept', false, monday9, settings).result, 'expired');
});
test('declining marks Lost and stops follow-ups', () => {
  const p = L.planQuoteAnswer(sentQuote(), qlead, 'decline', false, monday9, settings);
  assert.equal(p.leadPatch.Stage, 'Lost'); assert.equal(p.leadPatch['Follow-up Status'], 'Stopped');
});
test('quote page view hides internals and reports expiry', () => {
  const v = L.quoteView(sentQuote({ 'Link Expires At': '2026-10-01T00:00:00Z' }), qlead, monday9);
  assert.equal(v.status, 'Expired'); assert.equal('Approved By' in v, false);
});

// ---- staff button safety ----
test('staff request validation', () => {
  assert.equal(L.readStaffRequest({ action: 'book-inspection', record: 'recABCDEFGHIJKLMN' }).valid, true);
  assert.equal(L.readStaffRequest({ action: 'drop-table', record: 'recABCDEFGHIJKLMN' }).valid, false);
  assert.equal(L.readStaffRequest({ action: 'book-inspection', record: "rec'; DROP" }).valid, false);
});
test('cross-site confirmation blocked', () => {
  assert.equal(L.checkStaffOrigin({ origin: 'https://evil.test' }, 'https://n8n.example.com'), false);
  assert.equal(L.checkStaffOrigin({}, 'https://n8n.example.com'), false);
  assert.equal(L.checkStaffOrigin({ origin: 'https://n8n.example.com' }, 'https://n8n.example.com'), true);
});
test('Airtable formula escaping', () => assert.equal(L.af("O'Brien\\"), "'O\\'Brien\\\\'"));

// ---- problem reports ----
test('problem report is plain English and contains no personal data', () => {
  const d = L.describeProblem({ source: 'handled', step: 'Send email', ref: 'RF-1', problem: 'bounce for jane@example.com phone +44 7700 900123', executionId: '77' }, new Date());
  assert.ok(!/jane@example\.com/.test(d.telegram)); assert.ok(!/7700/.test(d.telegram)); assert.match(d.telegram, /What to do:/);
  assert.equal(d.activity.Status, 'Needs My Help');
});
test('identical alerts muted for 30 minutes', () => {
  const store = {}; const t = new Date('2026-10-12T10:00:00Z');
  assert.equal(L.shouldAlert(store, 'k', t), true);
  assert.equal(L.shouldAlert(store, 'k', new Date(t.getTime() + 5 * 60000)), false);
});

test('Code libraries use only globals that exist in the n8n Code-node sandbox (found live: URL is missing)', () => {
  const forbidden = [/new\s+URL\s*\(/, /URLSearchParams/, /\bfetch\s*\(/, /\brequire\s*\(/, /\bprocess\./, /\bsetTimeout\s*\(/, /\bTextEncoder\b/, /\bstructuredClone\b/];
  for (const f of forbidden) assert.ok(!f.test(src), 'a library uses ' + f);
});
console.log(passed + ' passed, ' + failures.length + ' failed');
for (const f of failures) console.log('  FAIL: ' + f);
process.exit(failures.length ? 1 : 0);
