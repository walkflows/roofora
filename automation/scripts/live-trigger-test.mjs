// ONE narrowly scoped live test of the Gmail POLLING trigger (unattended reply detection). Sends NO email.
//
//   node automation/scripts/live-trigger-test.mjs start     → switches the trigger ON and tells you when to reply
//   (you reply once, in the thread named below)
//   node automation/scripts/live-trigger-test.mjs verify    → waits for the poll, checks processing + deduplication, restores everything
//
// Safety: Customer Emails Enabled must be OFF (the script refuses otherwise and never changes it); the trigger query is
// limited to mail FROM the test address received in the last day; only ROOFORA workflows are touched; at the end every
// workflow is inactive, the trigger is disabled again, the temporary harness is deleted and the test lead's follow-ups are stopped.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { n8n, findWorkflow, deactivate, webhook, loadCfg, cfgPath, sleep, evidence } from './live-lib.mjs';
import { cfg, atList, atPatch, rec, loadState, saveState, ok, activityFor, TEST_TO } from './live-journey-lib.mjs';

const phase = process.argv[2];
const state = loadState(); const f2 = state.leads.f2;
const node = (script, ...a) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...a], { stdio: 'pipe' }).toString();
const setTrigger = (on) => { const c = loadCfg(); c.enable = { ...c.enable, replyDetection: on }; writeFileSync(cfgPath, JSON.stringify(c, null, 2) + '\n'); };
const triggerExecutions = async (sinceIso) => {
  const lm = await findWorkflow('ROOFORA — Lead Manager');
  const r = (await n8n('GET', `/executions?workflowId=${lm.id}&limit=50`)).data || [];
  return r.filter((e) => Date.parse(e.startedAt) >= Date.parse(sinceIso));
};

if (phase === 'start') {
  node('./live-step1.mjs'); // temporary harness (cannot send mail)
  const st = (await atList(loadCfg(), 'Settings', 'maxRecords=1'))[0].fields;
  if (st['Customer Emails Enabled']) throw new Error('Refusing: Customer Emails Enabled is ON. It must stay OFF for this test.');
  // re-arm the test lead so that "follow-ups stop" is observable (its follow-ups were stopped at cleanup)
  await atPatch(cfg, 'Leads', f2.id, { 'Follow-up Status': 'Active', 'Customer Replied At': null, 'Next Follow-up At': new Date(Date.now() + 36 * 3600e3).toISOString(), 'Next Action': 'Wait for the customer\'s answer to the quote' });
  setTrigger(true);
  node('./live-toggle.mjs', 'off'); node('./build-and-deploy.mjs'); node('./live-toggle.mjs', 'on');
  state.triggerTest = { armedAt: new Date().toISOString(), ref: f2.ref }; saveState(state);
  evidence(`\n## Gmail polling-trigger test armed ${state.triggerTest.armedAt} (emails OFF, trigger limited to mail from the test address)`);
  console.log(`\nREPLY NOW: in the test inbox open the email "Re: Your roofing quote from ROOFORA Demo (${f2.ref}, version 1)" (the follow-up in the quote thread) and send ONE short reply.\nThen tell me, and I will run: verify`);
}

if (phase === 'verify') {
  const t = state.triggerTest; if (!t) throw new Error('Run "start" first.');
  const deadline = Date.now() + 8 * 60e3; let lead;
  while (Date.now() < deadline) { lead = await rec('Leads', f2.id); if (lead.fields['Follow-up Status'] === 'Paused - Customer Replied') break; await sleep(20000); }
  const f = lead.fields;
  ok('POLLING TRIGGER processed the reply unattended: matched to the right enquiry, follow-ups PAUSED', f['Follow-up Status'] === 'Paused - Customer Replied' && Boolean(f['Customer Replied At']), `status=${f['Follow-up Status']} repliedAt=${f['Customer Replied At']}`);
  const recorded = (await activityFor(f2.id)).filter((a) => a.fields.Type === 'Email Received');
  ok('Recorded as "Email Received" exactly once', recorded.length === 1, `rows=${recorded.length}`);
  // deduplication: read the same message again by the other route, twice
  await webhook('roofora/check-replies', {}); await sleep(25000); await webhook('roofora/check-replies', {}); await sleep(25000);
  ok('Deduplication: re-reading the same reply on demand (x2) records nothing twice', (await activityFor(f2.id)).filter((a) => a.fields.Type === 'Email Received').length === 1);
  // one more full poll cycle must not re-process it either
  await sleep(6 * 60e3);
  const ex = await triggerExecutions(t.armedAt);
  ok('Deduplication: a further poll cycle did not process the message again', (await activityFor(f2.id)).filter((a) => a.fields.Type === 'Email Received').length === 1, `executions since arming=${ex.length} (${[...new Set(ex.map((e) => e.status))].join(',')})`);
  // restore the paused state
  await atPatch(cfg, 'Leads', f2.id, { 'Follow-up Status': 'Stopped', 'Next Follow-up At': null, 'Next Action': 'None (test lead — follow-ups stopped at test cleanup)' });
  setTrigger(false);
  node('./live-toggle.mjs', 'off'); node('./build-and-deploy.mjs');
  const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
  const wfs = (await n8n('GET', '/workflows?limit=250')).data.filter((w) => w.name.startsWith('ROOFORA'));
  let busy = 0; for (const w of wfs) for (const s of ['waiting', 'running']) busy += (await n8n('GET', `/executions?workflowId=${w.id}&status=${s}&limit=50`)).data.length;
  ok('FINAL: trigger disabled again, all workflows inactive, harness deleted, 0 waiting/running', wfs.every((w) => !w.active) && !wfs.some((w) => /Harness/.test(w.name)) && busy === 0, `waiting/running=${busy}`);
}
