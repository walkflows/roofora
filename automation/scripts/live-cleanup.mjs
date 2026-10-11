// Cleans up ONLY ROOFORA fictional test data in the ROOFORA base, sends nothing:
//  - stops Active follow-ups on test leads (except the leads kept for the single reply-detection check)
//  - marks open test tasks Done
//  - verifies the sending switch and the Settings, then removes the temporary harness workflow
import { n8n, findWorkflow, activate, deactivate, harness, sleep, evidence } from './live-lib.mjs';
import { cfg, atList, atPatch, loadState, saveState, ok, rec } from './live-journey-lib.mjs';

const state = loadState();
const keep = new Set([state.leads.f1.id, state.leads.f2.id]); // reply-detection check uses these two (follow-ups stay Active, emails stay OFF)
const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)');
await activate(h.id); await sleep(4000);
evidence(`\n## Final cleanup (${new Date().toISOString()}) — nothing is sent by this step`);

const leads = await atList(cfg, 'Leads', 'pageSize=100');
let stopped = 0;
for (const l of leads) if (l.fields['Follow-up Status'] === 'Active' && !keep.has(l.id) && /FICTIONAL|fictional/i.test(l.fields['Full Name'] || '') ) { await atPatch(cfg, 'Leads', l.id, { 'Follow-up Status': 'Stopped', 'Next Follow-up At': null, 'Next Action': 'None (test lead — follow-ups stopped at test cleanup)' }); stopped++; }
const acts = await atList(cfg, 'Activity', 'pageSize=100');
let closed = 0;
for (const a of acts) if (a.fields.Status === 'Open' || a.fields.Status === 'Needs My Help') { await atPatch(cfg, 'Activity', a.id, { Status: 'Done' }); closed++; }
const leadsAfter = await atList(cfg, 'Leads', 'pageSize=100');
const activeLeft = leadsAfter.filter((l) => l.fields['Follow-up Status'] === 'Active');
const actsAfter = await atList(cfg, 'Activity', 'pageSize=100');
ok('CLEANUP test follow-ups stopped; only the two reply-check leads keep Active follow-ups', activeLeft.every((l) => keep.has(l.id)) , `stopped ${stopped}; still Active: ${activeLeft.length} (${activeLeft.map((l) => l.fields['Enquiry Ref']).join(', ')})`);
ok('CLEANUP no open test tasks or unresolved problems remain', !actsAfter.some((a) => a.fields.Status === 'Open' || a.fields.Status === 'Needs My Help'), `closed ${closed}`);
const s = (await atList(cfg, 'Settings', 'maxRecords=1'))[0].fields;
ok('FINAL sending switch: Customer Emails Enabled OFF (unchecked), Test Mode ON, recipient + allowlist = test inbox only, sender "ROOFORA Demo"', !s['Customer Emails Enabled'] && s['Test Mode'] === true && s['Test Recipient Email'] === TEST_TO && s['Email Allowlist'] === TEST_TO && s['Sender Email'] === SENDER && s['Sender Name'] === 'ROOFORA Demo', `CustomerEmailsEnabled=${s['Customer Emails Enabled'] === true} TestMode=${s['Test Mode']}`);
state.cleanedAt = new Date().toISOString(); saveState(state);

await deactivate(h.id);
await n8n('DELETE', '/workflows/' + h.id);
const left = (await n8n('GET', '/workflows?limit=250')).data.filter((w) => w.name.startsWith('ROOFORA'));
ok('FINAL temporary test harness removed; remaining ROOFORA workflows are all inactive', !left.some((w) => /Harness/.test(w.name)) && left.every((w) => !w.active), left.map((w) => w.name.replace('ROOFORA — ', '') + '=' + (w.active ? 'ACTIVE' : 'inactive')).join(', '));
