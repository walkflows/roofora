// Live setup: inspect the real base, run Setup Check (read-only), optionally Create (adds only missing things).
//   node automation/scripts/live-setup.mjs            inspect + read-only check
//   node automation/scripts/live-setup.mjs --create   then add missing tables/fields + default Settings row
import { n8n, findWorkflow, activate, deactivate, harness, webhook, loadCfg, sleep, evidence } from './live-lib.mjs';

const cfg = loadCfg();
const who = await harness('airtable', 'GET', 'https://api.airtable.com/v0/meta/whoami');
evidence(`- REAL Airtable whoami: HTTP ${who.statusCode}; scopes=${who.body && who.body.scopes ? who.body.scopes.join(', ') : JSON.stringify(who.body && who.body.error)}`);

const meta = await harness('airtable', 'GET', `https://api.airtable.com/v0/meta/bases/${cfg.airtableBaseId}/tables`);
for (const t of meta.body.tables) {
  const recs = await harness('airtable', 'GET', `https://api.airtable.com/v0/${cfg.airtableBaseId}/${encodeURIComponent(t.name)}?pageSize=100&fields%5B%5D=${encodeURIComponent(t.fields[0].name)}`);
  evidence(`- inspected existing table "${t.name}": fields=[${t.fields.map((f) => f.name + ':' + f.type).join(', ')}]; records=${recs.body && recs.body.records ? recs.body.records.length + (recs.body.offset ? '+' : '') : '?'} (left untouched)`);
}

const wf = await findWorkflow('ROOFORA — Airtable Setup Check');
await activate(wf.id); await sleep(4000);
try {
  const chk = await webhook('roofora/setup-check', {});
  evidence(`- REAL Setup Check (read-only) via webhook: HTTP ${chk.status}; ok=${chk.data.ok}; mode=${chk.data.mode}; changed=${(chk.data.changed || []).length}; needsYou=${JSON.stringify(chk.data.needsYou || chk.data.problem).slice(0, 700)}`);
  if (process.argv.includes('--create')) {
    if (chk.data.problem) throw new Error('Check reported a problem; not creating: ' + chk.data.problem);
    const pre = (chk.data.leftUntouched || []).concat(meta.body.tables.map((t) => t.name));
    const made = await webhook('roofora/setup-create', {});
    evidence(`- REAL Setup Create via webhook: HTTP ${made.status}; ok=${made.data.ok}; changed=${(made.data.changed || []).length} change(s); needsYou=${JSON.stringify(made.data.needsYou).slice(0, 700)}; settings=${made.data.settings}`);
    evidence(`  changes: ${(made.data.changed || []).join(' | ').slice(0, 1200)}`);
    evidence(`  tables now: ${(made.data.tablesNow || []).join(', ')}; pre-existing left untouched: ${[...new Set(pre)].join(', ')}`);
    const again = await webhook('roofora/setup-check', {});
    evidence(`- REAL Setup Check after create: ok=${again.data.ok}; needsYou=${JSON.stringify(again.data.needsYou).slice(0, 500)}`);
  }
} finally {
  await deactivate(wf.id);
  const after = await n8n('GET', '/workflows/' + wf.id);
  console.log('Setup Check workflow active =', after.active);
}
