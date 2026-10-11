// Before launch: stops follow-ups on every EXISTING lead (old fictional test data) so the daily sweep can never send a batch of
// messages for them. Nothing is deleted; only Follow-up Status/Next Follow-up At change. Sends NO email.
import { execFileSync } from 'node:child_process';
import { n8n, findWorkflow, deactivate } from './live-lib.mjs';
import { cfg, atList, atPatch, ok } from './live-journey-lib.mjs';
const node = (script) => execFileSync(process.execPath, [new URL(script, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'pipe' }).toString();
node('./live-step1.mjs');
let changed = 0, total = 0;
try {
  const leads = await atList(cfg, 'Leads', 'pageSize=100&fields%5B%5D=Follow-up%20Status&fields%5B%5D=Next%20Follow-up%20At');
  total = leads.length;
  for (const l of leads) {
    const f = l.fields;
    if (f['Follow-up Status'] === 'Active' || f['Next Follow-up At']) {
      await atPatch(cfg, 'Leads', l.id, { 'Follow-up Status': 'Stopped', 'Next Follow-up At': null }); changed++;
    }
  }
  const left = (await atList(cfg, 'Leads', "pageSize=100&filterByFormula=" + encodeURIComponent("OR({Follow-up Status}='Active', {Next Follow-up At}!='')"))).length;
  ok('Old leads quieted: no existing lead has an active follow-up or a scheduled one', left === 0, `leads=${total} changed=${changed} stillActive=${left}`);
} finally {
  const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)'); if (h) { await deactivate(h.id); await n8n('DELETE', '/workflows/' + h.id); }
}
