// Live: verify the stored n8n Wait timers fired the 24 h and 2 h reminders exactly once AND recorded them (after the fix).
import { rec, sentMail, ok, loadState, sleep, evidence } from './live-journey-lib.mjs';
const s = loadState(); const b = s.b3;
evidence(`\n## Reminders after the fix (checked ${new Date().toISOString()}; bookings made ${b.bookedAt} / ${b.bookedAt2})`);
const items = [['24h', b.ref24, b.i24, /Reminder: roof inspection on /], ['2h', b.ref2, b.i2, /Reminder: roof inspection today at /]];
const deadline = Date.now() + 9 * 60e3; const got = {};
while (Date.now() < deadline) {
  for (const [w, ref, , re] of items) if (!got[w] && (await sentMail(ref)).some((m) => re.test(m.subject))) got[w] = true;
  if (got['24h'] && got['2h']) break;
  await sleep(30000);
}
await sleep(10000); // let the "mark sent" write land
for (const [w, ref, id, re] of items) {
  const mails = (await sentMail(ref)).filter((m) => re.test(m.subject));
  const f = (await rec('Inspections', id)).fields; const field = w === '24h' ? 'Reminder 24h Sent Version' : 'Reminder 2h Sent Version';
  ok(`R ${w} reminder for ${ref}: sent exactly once to the test inbox only, and recorded on the inspection (${field}=${f[field]})`, mails.length === 1 && TEST_RE.test(mails[0].to) && f[field] === f['Booking Version'], `emails=${mails.length} version=${f['Booking Version']}`);
}
const all2 = (await sentMail(b.ref2)).filter((m) => /Reminder:/.test(m.subject));
ok('R the booking only 2 h away got ONLY the 2 h reminder', all2.length === 1, `reminder emails=${all2.length}`);
