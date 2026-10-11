// Live journey A: settings for the test window + enquiry handling (website → n8n → Airtable → Gmail/Telegram).
import { findWorkflow, activate } from './live-lib.mjs';
import { cfg, site, sitePhoto, enquiryBody, refOf, leadByRef, rec, activityFor, sentMail, executionsSince, telegramFrom, png, ok, loadState, saveState, sleep, evidence, harness, atList, atPatch, TEST_TO } from './live-journey-lib.mjs';

const state = loadState();
const t0 = new Date().toISOString();
evidence(`\n## Journey A — enquiries (started ${t0})`);

// ---- A0: Settings for the test window (restored at the end by live-restore.mjs)
const settings = (await atList(cfg, 'Settings', 'maxRecords=1'))[0];
state.settingsId = settings.id;
if (!state.settingsBefore) state.settingsBefore = settings.fields; // keep the ORIGINAL snapshot for the restore step
const patch = await atPatch(cfg, 'Settings', settings.id, {
  'Customer Emails Enabled': true, 'Test Mode': true, 'Test Recipient Email': TEST_TO, 'Email Allowlist': TEST_TO,
  'Sender Email': SENDER, 'Sender Name': 'ROOFORA Demo',
  // temporary: open every day all day so bookings/reminders can be tested today (Sunday); restored afterwards
  'Opening Days': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'Opening Time': '00:00', 'Closing Time': '23:59',
});
ok('A0 test-window Settings saved (Customer Emails ON, Test Mode ON, recipient+allowlist = test inbox only)', patch.statusCode === 200, `HTTP ${patch.statusCode}`);
saveState(state);

for (const n of ['ROOFORA — Error Handler', 'ROOFORA — Send Customer Email']) await activate((await findWorkflow(n)).id); // n8n requires called sub-workflows to be published
const lm = await findWorkflow('ROOFORA — Lead Manager');
await activate(lm.id);
state.leadManagerId = lm.id;
await sleep(5000);
const probe = await fetch('https://n8n.walkflow.tech/webhook/roofora/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
ok('A0 Lead Manager activated; webhook rejects a call without the secret', probe.status === 403 || probe.status === 401, `HTTP ${probe.status}`);

const leads = {};
async function settle(ref, ms = 14000) { await sleep(ms); return (await leadByRef(ref)); }
async function mails(ref) { return sentMail(ref); }

// ---- A1: email preference, no photos
{
  const body = enquiryBody({ fullName: 'Alex Demo (fictional)' }); const ref = refOf(body.submissionId);
  const r = await site(body);
  ok('A1 website enquiry (email pref, no photos) answered success only after save', r.status === 200 && r.data.ok === true && r.data.enquiryRef === ref, `HTTP ${r.status} ref=${ref}`);
  const L = await settle(ref);
  ok('A1 exactly one lead row in Airtable', L.length === 1, `rows=${L.length}`);
  const f = (L[0] || {}).fields || {};
  ok('A1 lead fields (Stage New, Priority Normal, permission wording+version+timestamp, owner, next action)', f.Stage === 'New' && f.Priority === 'Normal' && f['Contact Permission'] === true && /contacted about this enquiry/.test(f['Permission Wording'] || '') && f['Permission Version'] === 'contact-permission-v1' && Boolean(f['Permission Recorded At']) && f.Owner === 'Office' && Boolean(f['Next Action']), `Stage=${f.Stage} Owner=${f.Owner} Area=${f['Service Area']}`);
  const m = await mails(ref);
  ok('A1 acknowledgement email sent ONLY to the test inbox, from the connected sender as "ROOFORA Demo"', m.length === 1 && TEST_RE.test(m[0].to) && /ROOFORA Demo/.test(m[0].from) && SENDER_RE.test(m[0].from), m.map((x) => `to=${x.to} from=${x.from} subject="${x.subject}"`).join(' | '));
  const acts = L[0] ? await activityFor(L[0].id) : [];
  ok('A1 Activity records the email (Email Sent, with Gmail id)', acts.some((a) => a.fields.Type === 'Email Sent' && a.fields['Provider ID']), acts.map((a) => a.fields.Type).join(','));
  const ex = await executionsSince(lm.id, t0); const tg = [];
  for (const e of ex.slice(0, 6)) tg.push(...(await telegramFrom(e.id)));
  ok('A1 Telegram alert sent (message id in n8n execution)', tg.length >= 1, `executions=${ex.map((e) => e.id + ':' + e.status).join(',')} telegram_message_ids=${tg.map((t) => t.message_id).join(',')}`);
  leads.a1 = { id: (L[0] || {}).id, ref, submissionId: body.submissionId };
}

// ---- A2: with 2 photos (+ duplicate photo retry, invalid file, bad token)
{
  const body = enquiryBody({ fullName: 'Pat Photos (fictional)', photoCount: 2 }); const ref = refOf(body.submissionId);
  const r = await site(body);
  ok('A2 enquiry with photos saved first; signed photo permission returned', r.status === 200 && r.data.ok && Boolean(r.data.photoToken), `HTTP ${r.status}`);
  const p1 = await sitePhoto(r.data.photoToken, 1, png(500, 400, 20));
  const p2 = await sitePhoto(r.data.photoToken, 2, png(400, 300, 90));
  ok('A2 both photos uploaded to Airtable', p1.status === 200 && p2.status === 200, `slot1=${p1.status}/${p1.data.status} slot2=${p2.status}/${p2.data.status}`);
  const retry = await sitePhoto(r.data.photoToken, 1, png(500, 400, 20), true);
  ok('A2 retry of photo 1 does not duplicate it', retry.status === 200 && retry.data.status === 'already-uploaded', `HTTP ${retry.status} ${retry.data.status}`);
  const bad = await sitePhoto(r.data.photoToken, 2, Buffer.from('this is not an image at all, just text'), true);
  ok('A2 a non-image file is refused before it reaches Airtable', bad.status === 415 || bad.status === 400, `HTTP ${bad.status}`);
  const forged = await sitePhoto(r.data.photoToken.slice(0, -4) + 'AAAA', 1, png(100, 100, 5));
  ok('A2 a forged photo permission is refused', forged.status === 403, `HTTP ${forged.status}`);
  const L = await settle(ref, 8000);
  const lead = L[0] ? await rec('Leads', L[0].id) : { fields: {} };
  const photos = lead.fields['Roof Photos'] || [];
  ok('A2 Airtable holds exactly 2 attachments with expected names (private Airtable storage)', photos.length === 2 && photos.every((p) => p.id && p.url && p.filename.startsWith(ref + '-photo-')), photos.map((p) => `${p.filename} ${p.size}B ${p.type}`).join(' | '));
  const m = await mails(ref);
  ok('A2 one acknowledgement email only', m.length === 1, `emails=${m.length}`);
  leads.a2 = { id: (L[0] || {}).id, ref };
}

// ---- A3: phone preference → callback task, no email, alert
{
  const body = enquiryBody({ fullName: 'Pia Phone (fictional)', preferredContact: 'Phone call' }); const ref = refOf(body.submissionId);
  const r = await site(body);
  ok('A3 phone-preference enquiry saved', r.status === 200 && r.data.ok, `HTTP ${r.status}`);
  const L = await settle(ref);
  const acts = L[0] ? await activityFor(L[0].id) : [];
  ok('A3 callback task created for staff', acts.some((a) => a.fields.Type === 'Task' && /Callback/.test(a.fields.Activity) && a.fields.Status === 'Open'), acts.map((a) => a.fields.Activity).join(' | '));
  const m = await mails(ref);
  ok('A3 NO customer email despite an email address being given', m.length === 0, `emails=${m.length}`);
  leads.a3 = { id: (L[0] || {}).id, ref };
}

// ---- A4: urgent
{
  const body = enquiryBody({ fullName: 'Una Urgent (fictional)', urgency: 'Urgent active leak/storm damage', preferredContact: 'Phone call', town: 'Leeds', postcode: 'LS1 1AA' }); const ref = refOf(body.submissionId);
  const r = await site(body);
  const L = await settle(ref);
  const f = (L[0] || {}).fields || {};
  const acts = L[0] ? await activityFor(L[0].id) : [];
  ok('A4 urgent enquiry: Priority Urgent while Stage stays New; callback task states no promise of attendance', f.Priority === 'Urgent' && f.Stage === 'New' && acts.some((a) => /URGENT callback/.test(a.fields.Activity) && /Do not promise attendance/.test(a.fields.Details || '')), `Priority=${f.Priority} Stage=${f.Stage}`);
  ok('A4 unmatched location flagged for review (service area not configured → Not Checked), not rejected', r.status === 200 && ['Not Checked', 'Needs Review', 'Possibly Out of Area'].includes(f['Service Area']), `Area=${f['Service Area']}`);
  leads.a4 = { id: (L[0] || {}).id, ref };
}

// ---- A5: duplicates — sequential retry and truly concurrent submissions
{
  const body = enquiryBody({ fullName: 'Dee Duplicate (fictional)' }); const ref = refOf(body.submissionId);
  const first = await site(body); const again = await site(body);
  ok('A5 retry of the same enquiry answered as duplicate with the same reference', first.data.ok && again.data.ok && again.data.duplicate === true && again.data.enquiryRef === ref, `dup=${again.data.duplicate}`);
  const L = await settle(ref, 12000);
  ok('A5 still exactly one lead and one email after the retry', L.length === 1 && (await mails(ref)).length === 1, `rows=${L.length}`);
  const body2 = enquiryBody({ fullName: 'Cody Concurrent (fictional)' }); const ref2 = refOf(body2.submissionId);
  const [c1, c2, c3] = await Promise.all([site(body2), site(body2), site(body2)]);
  const L2 = await settle(ref2, 18000);
  const real = L2.filter((l) => l.fields.Stage !== 'Duplicate'); const dup = L2.filter((l) => l.fields.Stage === 'Duplicate');
  const m2 = await mails(ref2);
  ok('A5 three simultaneous identical submissions → one live lead (extra rows, if any, are marked Duplicate)', real.length === 1, `rows=${L2.length} live=${real.length} duplicates=${dup.length} responses=${[c1, c2, c3].map((c) => c.status + (c.data.duplicate ? 'D' : '')).join(',')}`);
  ok('A5 simultaneous submissions produced exactly one acknowledgement email', m2.length === 1, `emails=${m2.length}`);
  leads.a5 = { id: (L[0] || {}).id, ref };
}

// ---- A6: a different customer address must never receive mail (Test Mode redirect)
{
  const body = enquiryBody({ fullName: 'Stan Stranger (fictional)', email: 'stranger@example.test' }); const ref = refOf(body.submissionId);
  const r = await site(body);
  await settle(ref);
  const m = await mails(ref);
  ok('A6 mail for another customer address is redirected to the test inbox and tagged [TEST for …]', r.status === 200 && m.length === 1 && TEST_RE.test(m[0].to) && !/stranger@/.test(m[0].to) && /^\[TEST for stranger@example\.test\]/.test(m[0].subject), m.map((x) => `to=${x.to} subject="${x.subject}"`).join(' | '));
  leads.a6 = { ref };
}

state.leads = { ...(state.leads || {}), ...leads };
saveState(state);
const ex = await executionsSince(lm.id, t0);
evidence(`- n8n Lead Manager executions since ${t0}: ${ex.length} total; statuses=${[...new Set(ex.map((e) => e.status))].join(',')}; failed=${ex.filter((e) => e.status === 'error').length}`);
