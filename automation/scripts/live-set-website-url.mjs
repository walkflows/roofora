// Sets Airtable Settings › Website URL (used for quote links) to the given address. Sends NO email.
//   node automation/scripts/live-set-website-url.mjs https://your-preview-address
// Temporarily installs the read/write harness, then deletes it and checks every workflow is inactive.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { n8n, findWorkflow, deactivate, loadCfg, cfgPath } from './live-lib.mjs';
import { cfg, atList, atPatch, ok } from './live-journey-lib.mjs';

const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error('Pass the https:// address, no path.');
const node = (script) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'pipe' }).toString();
node('./live-step1.mjs');
try {
  const s = (await atList(cfg, 'Settings', 'maxRecords=1'))[0];
  await atPatch(cfg, 'Settings', s.id, { 'Website URL': url });
  const f = (await atList(cfg, 'Settings', 'maxRecords=1'))[0].fields;
  ok('Website URL set; Customer Emails Enabled OFF; Test Mode ON; allowlist kept; Daily Enquiry Limit 5', f['Website URL'] === url && !f['Customer Emails Enabled'] && f['Test Mode'] === true && Boolean(f['Email Allowlist']) && f['Daily Enquiry Limit'] === 5, `websiteUrl=${f['Website URL']}`);
  const c = loadCfg(); c.settingsSeed = { ...(c.settingsSeed || {}), 'Website URL': url }; writeFileSync(cfgPath, JSON.stringify(c, null, 2) + '\n');
} finally {
  const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
}
const wfs = (await n8n('GET', '/workflows?limit=250')).data.filter((w) => w.name.startsWith('ROOFORA'));
let busy = 0; for (const w of wfs) for (const st of ['waiting', 'running']) busy += (await n8n('GET', `/executions?workflowId=${w.id}&status=${st}&limit=50`)).data.length;
ok('FINAL: 4 workflows inactive, harness deleted, 0 waiting/running', wfs.length === 4 && wfs.every((w) => !w.active) && busy === 0, wfs.map((w) => w.name.replace('ROOFORA — ', '') + '=' + (w.active ? 'ACTIVE' : 'inactive')).join(', ') + `; waiting/running=${busy}`);
