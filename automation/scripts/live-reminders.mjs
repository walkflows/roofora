// Live: verify the stored n8n Wait timers fired the 24 h and 2 h reminders exactly once.
import { cfg, rec, sentMail, ok, loadState, sleep, evidence } from './live-journey-lib.mjs';
const s = loadState();
evidence(`\n## Reminders (checked ${new Date().toISOString()}; bookings made ${s.bTimes && s.bTimes.bookedAt})`);
const want = [['a1', '24h', /^\[TEST[^\]]*\] Reminder: roof inspection on /], ['a2', '2h', /^\[TEST[^\]]*\] Reminder: roof inspection today at /]];
const deadline = Date.now() + 8 * 60e3;
let found = {};
while (Date.now() < deadline) {
  for (const [k, , re] of want) if (!found[k]) { const m = (await sentMail(s.leads[k].ref)).filter((x) => re.test(x.subject)); if (m.length) found[k] = m; }
  if (Object.keys(found).length === 2) break;
  await sleep(30000);
}
for (const [k, which, re] of want) {
  const mails = (await sentMail(s.leads[k].ref)).filter((x) => re.test(x.subject));
  const insp = (await rec('Inspections', s.insp[k])).fields;
  const field = which === '24h' ? 'Reminder 24h Sent Version' : 'Reminder 2h Sent Version';
  ok(`R ${which} reminder for ${s.leads[k].ref}: sent exactly once, to the test inbox only, and recorded on the inspection`, mails.length === 1 && TEST_RE.test(mails[0].to) && insp[field] === insp['Booking Version'], `emails=${mails.length} ${field}=${insp[field]} version=${insp['Booking Version']}`);
}
// the 2 h reminder must NOT also have produced a 24 h one (start was only 2 h away) and vice-versa
const a2all = (await sentMail(s.leads.a2.ref)).filter((x) => /Reminder:/.test(x.subject));
ok('R the 2 h-away booking got ONLY the 2 h reminder (the 24 h one was already in the past, so skipped)', a2all.length === 1, `reminder emails=${a2all.length}`);
