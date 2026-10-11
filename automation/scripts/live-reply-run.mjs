// The ONE remaining real check, run once: does the system match the tester's real reply to the right enquiry,
// record it, and stop that enquiry's follow-ups — without sending ANY email (Customer Emails Enabled stays OFF)?
import { execFileSync } from 'node:child_process';
import { n8n, findWorkflow, deactivate, webhook, harness, sleep, evidence } from './live-lib.mjs';
import { cfg, atList, atPatch, rec, loadState, saveState, ok, activityFor, TEST_TO, executionsSince } from './live-journey-lib.mjs';

const state = loadState(); const f1 = state.leads.f1; const f2 = state.leads.f2;
const node = (script, ...a) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...a], { stdio: 'pipe' }).toString();
const sentCount = async () => ((await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=' + encodeURIComponent('in:sent to:' + TEST_TO))).body.messages || []).length;
const t0 = new Date().toISOString();

node('./live-step1.mjs'); // recreates the temporary harness (it cannot send mail)
const st = (await atList(cfg, 'Settings', 'maxRecords=1'))[0].fields;
if (st['Customer Emails Enabled']) throw new Error('Refusing: Customer Emails Enabled is ON.');
evidence(`\n## Real reply-detection check (${t0}) — Customer Emails Enabled OFF, no email will be sent`);
const sentBefore = await sentCount();
const leadsBefore = await atList(cfg, 'Leads', 'pageSize=100');

// the tester's real reply, as it sits in the mailbox
const inbox = (await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=' + encodeURIComponent('in:inbox from:' + TEST_TO + ' newer_than:2d'))).body.messages || [];
const f1lead = await rec('Leads', f1.id);
const f1threads = String(f1lead.fields['Gmail Thread IDs'] || '').split('\n').filter(Boolean);
const replies = [];
for (const m of inbox) {
  const d = (await harness('gmail', 'GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`)).body;
  replies.push({ id: m.id, threadId: m.threadId, subject: ((d.payload.headers.find((h) => h.name === 'Subject') || {}).value || ''), when: new Date(Number(d.internalDate)).toISOString() });
}
const mine = replies.filter((r) => f1threads.includes(r.threadId));
ok('The real reply is in the mailbox, in the Gmail thread stored on enquiry ' + f1.ref, mine.length >= 1, replies.map((r) => `"${r.subject}" at ${r.when} thread-match=${f1threads.includes(r.threadId)}`).join(' | '));

// run the on-demand check (workflows are switched on only for this)
node('./live-toggle.mjs', 'off'); node('./deploy-n8n.mjs', '--apply'); node('./live-toggle.mjs', 'on');
await sleep(4000);
const r1 = await webhook('roofora/check-replies', {}); await sleep(30000);
const f = (await rec('Leads', f1.id)).fields;
ok('REAL reply matched to the correct enquiry: customer reply recorded and follow-ups PAUSED', r1.status === 200 && f['Follow-up Status'] === 'Paused - Customer Replied' && Boolean(f['Customer Replied At']) && /Reply to the customer/.test(f['Next Action'] || ''), `status=${f['Follow-up Status']} repliedAt=${f['Customer Replied At']} next="${f['Next Action']}"`);
const acts = await activityFor(f1.id);
ok('Recorded as "Email Received" exactly once, with the Gmail message id', acts.filter((a) => a.fields.Type === 'Email Received').length === 1 && acts.some((a) => a.fields.Type === 'Email Received' && a.fields['Provider ID']), acts.map((a) => a.fields.Type).join(','));
const leadsAfter = await atList(cfg, 'Leads', 'pageSize=100');
const wrongly = leadsAfter.filter((l) => l.id !== f1.id && l.fields['Customer Replied At'] && !leadsBefore.find((b) => b.id === l.id && b.fields['Customer Replied At']));
const f2fields = (await rec('Leads', f2.id)).fields;
ok('Unrelated enquiries (every other lead, incl. one with the SAME email address) were NOT marked as replied', wrongly.length === 0 && !f2fields['Customer Replied At'], `other leads checked=${leadsAfter.length - 1}; wrongly marked=${wrongly.length}; f2 follow-up=${f2fields['Follow-up Status']}`);
await webhook('roofora/check-replies', {}); await sleep(25000);
ok('Re-reading the same reply (second check) records nothing twice', (await activityFor(f1.id)).filter((a) => a.fields.Type === 'Email Received').length === 1);

// follow-ups must now do nothing for this lead
const step = (await rec('Leads', f1.id)).fields['Follow-up Step'];
await atPatch(cfg, 'Leads', f1.id, { 'Next Follow-up At': new Date(Date.now() - 3600e3).toISOString() });
const actsBefore = (await activityFor(f1.id)).length;
await webhook('roofora/sweep', {}); await sleep(25000);
const post = (await rec('Leads', f1.id)).fields;
ok('Follow-ups STOPPED by the reply: a due sweep made no step change and no send attempt for this enquiry', post['Follow-up Step'] === step && post['Follow-up Status'] === 'Paused - Customer Replied' && (await activityFor(f1.id)).length === actsBefore, `step ${step} -> ${post['Follow-up Step']}; status=${post['Follow-up Status']}`);
const sentAfter = await sentCount();
ok('ZERO emails were sent by this check (Gmail Sent unchanged)', sentAfter === sentBefore, `sent to test inbox before=${sentBefore} after=${sentAfter}`);
const ex = await executionsSince((await findWorkflow('ROOFORA — Lead Manager')).id, t0);
evidence(`- n8n Lead Manager executions during this check: ${ex.length} (${[...new Set(ex.map((e) => e.status))].join(',')}); errors=${ex.filter((e) => e.status === 'error').length}`);

// cancel the remaining test follow-up, switch everything off, remove the harness
await atPatch(cfg, 'Leads', f2.id, { 'Follow-up Status': 'Stopped', 'Next Follow-up At': null, 'Next Action': 'None (test lead — follow-ups stopped at test cleanup)' });
node('./live-toggle.mjs', 'off');
const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
const wfs = (await n8n('GET', '/workflows?limit=250')).data.filter((w) => w.name.startsWith('ROOFORA'));
let busy = 0; for (const w of wfs) for (const s of ['waiting', 'running']) busy += (await n8n('GET', `/executions?workflowId=${w.id}&status=${s}&limit=50`)).data.length;
ok('FINAL: all ROOFORA workflows inactive, harness deleted, 0 waiting/running executions', wfs.every((w) => !w.active) && !wfs.some((w) => /Harness/.test(w.name)) && busy === 0, wfs.map((w) => w.name.replace('ROOFORA — ', '') + '=' + (w.active ? 'ACTIVE' : 'inactive')).join(', ') + `; waiting/running=${busy}`);
state.replyTestAt = new Date().toISOString(); saveState(state);
