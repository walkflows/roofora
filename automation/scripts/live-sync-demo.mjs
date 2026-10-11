// Syncs the paused system with the latest code: updates the 4 workflows (inactive, with backups), adds missing Airtable
// fields (add-only), sets the demo cap. Sends NO email; ends with every workflow inactive and the harness deleted.
import { execFileSync } from 'node:child_process';
import { n8n, findWorkflow, activate, deactivate, webhook, sleep, evidence } from './live-lib.mjs';
import { cfg, atList, atPatch, ok } from './live-journey-lib.mjs';

const node = (script, ...a) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), ...a], { stdio: 'pipe' }).toString();
evidence(`\n## Sync of the paused system with the demo-protection code (${new Date().toISOString()}) — no email possible`);

node('./live-step1.mjs'); // temporary read/write harness
const s0 = (await atList(cfg, 'Settings', 'maxRecords=1'))[0];
if (s0.fields['Customer Emails Enabled']) throw new Error('Refusing: Customer Emails Enabled is ON.');

node('./live-toggle.mjs', 'off');
const out = node('./build-and-deploy.mjs');
evidence('- workflows updated (inactive, previous versions backed up): ' + out.split('\n').filter(Boolean).map((l) => l.replace(/\s+id=.*/, '')).join('; '));

const setup = await findWorkflow('ROOFORA — Airtable Setup Check');
await activate(setup.id); await sleep(4000);
try {
  const r = await webhook('roofora/setup-create', {});
  evidence(`- Airtable Setup (add-only): ok=${r.data.ok}; changes=${JSON.stringify(r.data.changed)}; needsYou=${JSON.stringify(r.data.needsYou).slice(0, 300)}`);
} finally { await deactivate(setup.id); }

const s = (await atList(cfg, 'Settings', 'maxRecords=1'))[0];
await atPatch(cfg, 'Settings', s.id, { 'Daily Enquiry Limit': 5 });
const after = (await atList(cfg, 'Settings', 'maxRecords=1'))[0].fields;
ok('SYNC Settings: Daily Enquiry Limit = 5; Customer Emails Enabled OFF; Test Mode ON; allowlist unchanged', after['Daily Enquiry Limit'] === 5 && !after['Customer Emails Enabled'] && after['Test Mode'] === true && Boolean(after['Email Allowlist']), `limit=${after['Daily Enquiry Limit']} testMode=${after['Test Mode']} websiteUrl=${after['Website URL']}`);

const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
const wfs = (await n8n('GET', '/workflows?limit=250')).data.filter((w) => w.name.startsWith('ROOFORA'));
let busy = 0; for (const w of wfs) for (const st of ['waiting', 'running']) busy += (await n8n('GET', `/executions?workflowId=${w.id}&status=${st}&limit=50`)).data.length;
ok('SYNC final: all ROOFORA workflows inactive, harness deleted, 0 waiting/running executions', wfs.length === 4 && wfs.every((w) => !w.active) && busy === 0, wfs.map((w) => w.name.replace('ROOFORA — ', '') + '=' + (w.active ? 'ACTIVE' : 'inactive')).join(', ') + `; waiting/running=${busy}`);
