// Live step 2: real Gmail sender check, dedicated test calendar, real Telegram test alert. (No Airtable needed.)
import { writeFileSync } from 'node:fs';
import { n8n, findWorkflow, activate, harness, loadCfg, cfgPath, sleep, evidence } from './live-lib.mjs';
import { buildHarness } from './live-harness.mjs';

let cfg = loadCfg();
async function reinstall() {
  const h = await findWorkflow('ROOFORA — Test Harness (TEMPORARY)');
  await n8n('POST', '/workflows/' + h.id + '/deactivate').catch(() => {});
  await n8n('PUT', '/workflows/' + h.id, buildHarness(cfg));
  await activate(h.id);
  await sleep(3500);
}
await reinstall();

// ---- Gmail: which address does the credential send as?
const prof = await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
evidence(`- REAL Gmail credential zlo3Cpbv…: profile HTTP ${prof.statusCode}; authorised address = ${prof.body && prof.body.emailAddress}`);
const sendAs = await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs');
evidence(`- REAL Gmail send-as list: HTTP ${sendAs.statusCode}; ${sendAs.statusCode === 200 ? (sendAs.body.sendAs || []).map((s) => s.sendAsEmail + (s.isPrimary ? ' (primary)' : ' (alias)') + (s.verificationStatus ? ' [' + s.verificationStatus + ']' : '')).join(', ') : JSON.stringify(sendAs.body && sendAs.body.error || '').slice(0, 200)}`);
cfg.gmailAuthorisedAddress = prof.body && prof.body.emailAddress;

// ---- Calendar: find or create the dedicated test calendar (never touches the primary calendar)
const list = await harness('calendar', 'GET', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer');
evidence(`- REAL Calendar credential 0bMVScfb…: calendarList HTTP ${list.statusCode}; ${list.statusCode === 200 ? list.body.items.length + ' writable calendar(s)' : JSON.stringify(list.body && list.body.error || '').slice(0, 200)}`);
let cal = list.statusCode === 200 ? list.body.items.find((c) => c.summary === 'ROOFORA Inspections (TEST)') : null;
if (!cal && list.statusCode === 200) {
  const made = await harness('calendar', 'POST', 'https://www.googleapis.com/calendar/v3/calendars', { summary: 'ROOFORA Inspections (TEST)', timeZone: 'Europe/London', description: 'Fictional test inspections for the ROOFORA automation. Safe to delete.' });
  evidence(`- REAL Calendar create: HTTP ${made.statusCode}${made.statusCode === 200 ? ' → created "ROOFORA Inspections (TEST)" tz=' + made.body.timeZone : ' ' + JSON.stringify(made.body && made.body.error || '').slice(0, 220)}`);
  cal = made.statusCode === 200 ? made.body : null;
} else if (cal) evidence('- REAL Calendar: "ROOFORA Inspections (TEST)" already exists — reused (no duplicate created)');
if (cal) {
  cfg.testCalendarId = cal.id;
  cfg.settingsSeed = { ...cfg.settingsSeed, 'Calendar ID': cal.id };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  await reinstall(); // harness may now read/write events on THIS calendar only
  const ev = await harness('calendar', 'GET', 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.id) + '/events?maxResults=5');
  evidence(`- REAL Calendar events read on the test calendar: HTTP ${ev.statusCode}; events=${ev.body && ev.body.items ? ev.body.items.length : '?'}; calendar timezone=${ev.body && ev.body.timeZone}`);
}

// ---- Telegram: one labelled test alert (only with --telegram, so reruns do not spam the chat)
const tg = !process.argv.includes('--telegram') ? { statusCode: 200, body: { message_id: 'skipped' } } : await harness('telegram', 'POST', '', { text: 'ROOFORA — TEST · connection check (no action needed).' });
if (process.argv.includes('--telegram')) evidence(`- REAL Telegram test alert: ${tg.statusCode === 200 ? 'delivered, message_id=' + (tg.body && tg.body.message_id) : 'FAILED ' + (tg.error || JSON.stringify(tg.body)).slice(0, 200)}`);
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
