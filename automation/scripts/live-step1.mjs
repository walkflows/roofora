// Live step 1 (read-only): verify the import, install the temporary harness, check Airtable base access, Gmail sender, calendars.
import { writeFileSync } from 'node:fs';
import { n8n, findWorkflow, activate, loadCfg, cfgPath, harness, sleep, evidence } from './live-lib.mjs';
import { buildHarness } from './live-harness.mjs';

const cfg = loadCfg();
const names = { errorHandler: 'ROOFORA — Error Handler', sendEmail: 'ROOFORA — Send Customer Email', leadManager: 'ROOFORA — Lead Manager', airtableSetup: 'ROOFORA — Airtable Setup Check' };
const ids = {};
for (const [k, n] of Object.entries(names)) {
  const w = await findWorkflow(n);
  if (!w) throw new Error('missing ' + n);
  ids[k] = w.id;
  const full = await n8n('GET', '/workflows/' + w.id);
  const credRefs = new Set(full.nodes.flatMap((x) => Object.values(x.credentials || {}).map((c) => c.id)));
  evidence(`- import check: ${n} id=${w.id} active=${full.active} nodes=${full.nodes.length} credentialIdsReferenced=${[...credRefs].join(',')}`);
}
cfg.workflowIds = { sendEmail: ids.sendEmail, errorHandler: ids.errorHandler };
cfg.liveIds = ids;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');

// harness: create (or update) and activate
let h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)');
const body = buildHarness(cfg);
if (h) await n8n('PUT', '/workflows/' + h.id, body); else h = await n8n('POST', '/workflows', body);
await activate(h.id);
cfg.liveIds.harness = h.id;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
evidence(`- harness installed and activated: id=${h.id} (temporary; removed at the end)`);
await sleep(4000);

// Airtable: exact base
const meta = await harness('airtable', 'GET', `https://api.airtable.com/v0/meta/bases/${cfg.airtableBaseId}/tables`);
if (meta.statusCode === 200) {
  evidence(`- REAL Airtable base ${cfg.airtableBaseId}: schema read OK (HTTP 200); tables found: ${meta.body.tables.map((t) => t.name + ' (' + t.fields.length + ' fields)').join(', ') || '(none)'}`);
} else {
  evidence(`- REAL Airtable base ${cfg.airtableBaseId}: schema read FAILED HTTP ${meta.statusCode} ${JSON.stringify(meta.body && meta.body.error || meta.body).slice(0, 220)}`);
  const recs = await harness('airtable', 'GET', `https://api.airtable.com/v0/${cfg.airtableBaseId}/Settings?maxRecords=1`);
  evidence(`  (records probe on Settings: HTTP ${recs.statusCode} ${JSON.stringify(recs.body && recs.body.error || '').slice(0, 160)})`);
}

// Gmail: which address does the credential send as?
const prof = await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
evidence(`- REAL Gmail profile: HTTP ${prof.statusCode} address=${prof.body && prof.body.emailAddress}`);
const sendAs = await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs');
evidence(`- REAL Gmail send-as addresses: HTTP ${sendAs.statusCode} ${sendAs.statusCode === 200 ? (sendAs.body.sendAs || []).map((s) => s.sendAsEmail + (s.isPrimary ? ' (primary)' : '') + (s.verificationStatus ? ' [' + s.verificationStatus + ']' : '')).join(', ') : JSON.stringify(sendAs.body && sendAs.body.error || '').slice(0, 200)}`);

// Calendar: existing calendars (names + ids + tz only)
const cals = await harness('calendar', 'GET', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer');
evidence(`- REAL Calendar list: HTTP ${cals.statusCode}; writable calendars: ${cals.statusCode === 200 ? cals.body.items.map((c) => '"' + c.summary + '" tz=' + c.timeZone + (c.primary ? ' (primary)' : '')).join('; ') : JSON.stringify(cals.body && cals.body.error || '').slice(0, 200)}`);
