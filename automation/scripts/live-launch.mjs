// Launch step for the portfolio demo: sets Website URL and turns Customer Emails Enabled ON (Test Mode stays ON and the
// allowlist is verified to contain ONLY the test inbox), then removes the temporary harness. Sends NO email itself.
//   node automation/scripts/live-launch.mjs https://roofora-rose.vercel.app
import { execFileSync } from 'node:child_process';
import { n8n, findWorkflow, deactivate } from './live-lib.mjs';
import { cfg, atList, atPatch, ok, TEST_TO } from './live-journey-lib.mjs';
const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error('Pass the https:// address, no path.');
const node = (script) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'pipe' }).toString();
node('./live-step1.mjs');
try {
  const s = (await atList(cfg, 'Settings', 'maxRecords=1'))[0];
  const allow = String(s.fields['Email Allowlist'] || '').split(/[\s,;]+/).filter(Boolean).map((x) => x.toLowerCase());
  if (!(s.fields['Test Mode'] === true && allow.length === 1 && allow[0] === String(TEST_TO).toLowerCase())) throw new Error('Refusing: Test Mode must be ON and the allowlist must be exactly the demo inbox.');
  await atPatch(cfg, 'Settings', s.id, { 'Website URL': url, 'Customer Emails Enabled': true });
  const f = (await atList(cfg, 'Settings', 'maxRecords=1'))[0].fields;
  ok('Settings: Website URL final; Customer Emails Enabled ON; Test Mode ON; allowlist = demo inbox only; daily cap kept', f['Website URL'] === url && f['Customer Emails Enabled'] === true && f['Test Mode'] === true && f['Daily Enquiry Limit'] === 5, `websiteUrl=${f['Website URL']} limit=${f['Daily Enquiry Limit']}`);
} finally {
  const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
}
