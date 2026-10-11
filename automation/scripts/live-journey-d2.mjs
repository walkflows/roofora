// Live journey D2: retest of D2 (fresh phone lead) and D5 (settings problem reported without a task) after the fix.
import { n8n } from './live-lib.mjs';
import { cfg, site, enquiryBody, refOf, leadByRef, rec, activityFor, sentMail, executionsSince, telegramFrom, ok, loadState, sleep, evidence, atPatch } from './live-journey-lib.mjs';
import { webhook } from './live-lib.mjs';
const state = loadState(); const t0 = new Date().toISOString();
evidence(`\n## Journey D2 — retests (started ${t0})`);
async function newLead(name, over = {}) { const b = enquiryBody({ fullName: name, ...over }); const ref = refOf(b.submissionId); await site(b); await sleep(12000); const l = (await leadByRef(ref))[0]; return { id: l.id, ref }; }
// D2: fresh phone-preference lead
const p = await newLead('Pia Phone Two (fictional)', { preferredContact: 'Phone call' });
await atPatch(cfg, 'Leads', p.id, { 'Next Follow-up At': new Date(Date.now() - 3600e3).toISOString() });
const before = (await sentMail(p.ref)).length;
await webhook('roofora/sweep', {}); await sleep(17000);
const acts = await activityFor(p.id);
ok('D2 phone-preference lead: follow-up CALL task created, no email', acts.some((a) => /Follow-up call #1/.test(a.fields.Activity)) && (await sentMail(p.ref)).length === before, acts.map((a) => a.fields.Activity).join(' | '));
// D5: settings problem
const sid = state.settingsId;
await atPatch(cfg, 'Settings', sid, { 'Business Timezone': 'Mars/Phobos' });
const e1 = await newLead('Eve Error Two (fictional)');
await sleep(6000);
const ae = await activityFor(e1.id);
const problem = ae.find((a) => a.fields.Type === 'Automation Problem' && a.fields.Status === 'Needs My Help');
const errExec = ((await n8n('GET', `/executions?workflowId=${cfg.workflowIds.errorHandler}&limit=10`)).data || []).filter((x) => Date.parse(x.startedAt) >= Date.parse(t0));
const lmEx = await executionsSince(state.leadManagerId, t0); const tg = [];
for (const x of errExec) tg.push(...(await telegramFrom(x.id)));
ok('D5 a real Settings problem: enquiry saved; "Needs My Help" row with plain-English detail and recommended action', Boolean(problem) && /Business Timezone/.test(problem.fields.Details || '') && /Recommended action/.test(problem.fields.Details || ''), problem ? problem.fields.Activity : 'no problem row');
ok('D5 Error Handler executed (real n8n execution) and sent its own Telegram alert (message id captured)', errExec.length >= 1 && errExec.every((x) => x.status === 'success') && tg.length >= 1, `errorHandlerExecutions=${errExec.map((x) => x.id + ':' + x.status).join(',')} telegramMsgIds=${tg.map((t) => t.message_id).join(',')}`);
await atPatch(cfg, 'Settings', sid, { 'Business Timezone': 'Europe/London' });
const e2 = await newLead('Rick Recovered Two (fictional)');
ok('D5 recovery: after the setting is fixed a new enquiry raises no problem', !(await activityFor(e2.id)).some((a) => a.fields.Type === 'Automation Problem'));
