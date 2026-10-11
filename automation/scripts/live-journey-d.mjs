// Live journey D: follow-up sweep + stop rules, error recording, email allowlist and kill switch.
import { webhook } from './live-lib.mjs';
import { cfg, site, enquiryBody, refOf, leadByRef, rec, activityFor, sentMail, atList, executionsSince, telegramFrom, ok, loadState, saveState, sleep, evidence, atPatch, atCreate, TEST_TO } from './live-journey-lib.mjs';

const state = loadState(); const L = state.leads;
const t0 = new Date().toISOString();
evidence(`\n## Journey D — follow-ups, errors, safety switches (started ${t0})`);
const base = 'https://n8n.walkflow.tech';
const press = (action, record) => webhook('roofora/staff', { action, record }, { method: 'POST', basic: true, headers: { Origin: base } });
const past = () => new Date(Date.now() - 3600e3).toISOString();
const sweep = async () => { const r = await webhook('roofora/sweep', {}); await sleep(17000); return r; };
async function newLead(name, over = {}) {
  const b = enquiryBody({ fullName: name, ...over }); const ref = refOf(b.submissionId);
  await site(b); await sleep(12000);
  const lead = (await leadByRef(ref))[0];
  return { id: lead.id, ref, submissionId: b.submissionId };
}
const count = async (ref, re) => (await sentMail(ref)).filter((m) => re.test(m.subject)).length;

// ---- D1: enquiry follow-up — due, sent once, repeated sweeps send nothing more
const f1 = await newLead('Fran Followup (fictional)');
await atPatch(cfg, 'Leads', f1.id, { 'Next Follow-up At': past() });
const sw1 = await sweep();
const lf = (await rec('Leads', f1.id)).fields;
ok('D1 sweep webhook accepted; due enquiry follow-up emailed once to the test inbox only', sw1.status === 200 && (await count(f1.ref, /^\[TEST[^\]]*\] Re: We have received/)) === 1 && lf['Follow-up Step'] === 1 && Boolean(lf['Next Follow-up At']) && lf['Next Follow-up At'] > new Date().toISOString(), `step=${lf['Follow-up Step']} next=${lf['Next Follow-up At']}`);
await sweep(); await sweep();
ok('D1 two more sweeps (repeated triggers) send NO further email', (await count(f1.ref, /Re: We have received/)) === 1 && (await sentMail(f1.ref)).length === 2, `emails=${(await sentMail(f1.ref)).length}`);

// ---- D2: phone-preference customer gets a follow-up CALL task, never an email
await atPatch(cfg, 'Leads', L.a3.id, { 'Next Follow-up At': past() });
const before = (await sentMail(L.a3.ref)).length;
await sweep();
const acts3 = await activityFor(L.a3.id);
ok('D2 phone-preference lead: follow-up CALL task created, no email', acts3.some((a) => /Follow-up call #1/.test(a.fields.Activity)) && (await sentMail(L.a3.ref)).length === before);

// ---- D3: unanswered quote follow-up
const f2 = await newLead('Quinn Quote (fictional)');
const q = (await atCreate(cfg, 'Quotes', { Quote: 'FICTIONAL TEST quote', Lead: [f2.id], Version: 1, Scope: 'FICTIONAL TEST SCOPE: re-lay the rear slope with new battens and felt.', Amount: 1840, Status: 'Draft', Approved: true, 'Approved By': 'Test Approver (fictional)' })).body.records[0].id;
await press('send-quote', q); await sleep(9000);
await atPatch(cfg, 'Leads', f2.id, { 'Next Follow-up At': past() });
await sweep();
const lf2 = (await rec('Leads', f2.id)).fields;
ok('D3 unanswered quote: follow-up email "Re: Your roofing quote…" sent once, step advanced', (await count(f2.ref, /Re: Your roofing quote/)) === 1 && lf2['Follow-up Step'] === 1 && lf2.Stage === 'Quote Sent', `step=${lf2['Follow-up Step']}`);

// ---- D4: follow-ups must stop for staff takeover and withdrawn permission
const f3 = await newLead('Stan Stop (fictional)');
await atPatch(cfg, 'Leads', f3.id, { 'Follow-up Status': 'Paused - Staff Handling', 'Next Follow-up At': past() });
await sweep();
ok('D4 staff takeover (Paused - Staff Handling): due follow-up NOT sent', (await count(f3.ref, /Re: We have received/)) === 0);
await atPatch(cfg, 'Leads', f3.id, { 'Follow-up Status': 'Active', 'Permission Withdrawn': true, 'Next Follow-up At': past() });
await sweep();
const lf3 = (await rec('Leads', f3.id)).fields;
ok('D4 withdrawn contact permission: follow-up NOT sent and follow-ups Stopped', (await count(f3.ref, /Re: We have received/)) === 0 && lf3['Follow-up Status'] === 'Stopped', `status=${lf3['Follow-up Status']}`);

// ---- D5: error recording — a real settings problem is recorded as "Needs My Help" + Telegram alert, then recovered
const sid = state.settingsId;
await atPatch(cfg, 'Settings', sid, { 'Business Timezone': 'Mars/Phobos' });
const e1 = await newLead('Eve Error (fictional)');
await sleep(6000);
const ae = await activityFor(e1.id);
const problem = ae.find((a) => a.fields.Type === 'Automation Problem' && a.fields.Status === 'Needs My Help');
const ex = await executionsSince(state.leadManagerId, t0); const tg = [];
for (const x of ex.slice(0, 12)) tg.push(...(await telegramFrom(x.id)));
ok('D5 a real Settings problem: enquiry still saved; plain-English "Needs My Help" row with recommended action', Boolean(problem) && /Business Timezone/.test(problem.fields.Details || '') && /Recommended action/.test(problem.fields.Details || ''), problem ? problem.fields.Activity : 'no problem row');
const errExec = await (async () => { const r = await (await import('./live-lib.mjs')).n8n('GET', `/executions?workflowId=${cfg.workflowIds.errorHandler}&limit=10`); return (r.data || []).filter((x) => Date.parse(x.startedAt) >= Date.parse(t0)); })();
ok('D5 Error Handler workflow executed (real n8n execution) and a Telegram alert went out', errExec.length >= 1 && tg.length >= 1, `errorHandlerExecutions=${errExec.map((x) => x.id + ':' + x.status).join(',')} telegramMsgIds=${tg.length}`);
await atPatch(cfg, 'Settings', sid, { 'Business Timezone': 'Europe/London' });
const e2 = await newLead('Rick Recovered (fictional)');
const ae2 = await activityFor(e2.id);
ok('D5 recovery: after fixing the setting, a new enquiry raises no problem', !ae2.some((a) => a.fields.Type === 'Automation Problem'));

// ---- D6: the email allowlist blocks any address that is not listed (live)
await atPatch(cfg, 'Settings', sid, { 'Email Allowlist': 'blocked-test@example.test' });
const g1 = await newLead('Al Allowlist (fictional)');
const ag = await activityFor(g1.id);
ok('D6 allowlist enforced live: nothing sent; the block is recorded with its reason', (await sentMail(g1.ref)).length === 0 && ag.some((a) => /Email Allowlist/.test(a.fields.Details || '')), ag.map((a) => a.fields.Activity).join(' | '));
await atPatch(cfg, 'Settings', sid, { 'Email Allowlist': TEST_TO });

// ---- D7: the master switch stops all customer email immediately
await atPatch(cfg, 'Settings', sid, { 'Customer Emails Enabled': false });
const h1 = await newLead('Sam Switch (fictional)');
const ah = await activityFor(h1.id);
ok('D7 Customer Emails Enabled = off: nothing sent, recorded as "not sent"', (await sentMail(h1.ref)).length === 0 && ah.some((a) => /not sent/i.test(a.fields.Activity)), ah.map((a) => a.fields.Activity).join(' | '));
await atPatch(cfg, 'Settings', sid, { 'Customer Emails Enabled': true });

state.leads = { ...L, f1, f2, f3 }; saveState(state);
const exAll = await executionsSince(state.leadManagerId, t0);
evidence(`- n8n Lead Manager executions during journey D: ${exAll.length}; errors=${exAll.filter((x) => x.status === 'error').length}`);
