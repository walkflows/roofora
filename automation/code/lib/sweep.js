// ROOFORA automation — daily follow-up sweep.
// Depends on core.js, email.js. Runs once per business day, so the Airtable
// cost is 2 reads + a few batched writes per day (see docs/AIRTABLE-BUDGET.md).

function dueLeadsFormula(now) {
  return (
    "AND({Follow-up Status}='Active', {Next Follow-up At}!='', " +
    "IS_BEFORE({Next Follow-up At}, DATEADD(" + af(now.toISOString()) + ", 1, 'hours')), " +
    "{Stage}!='Duplicate', {Stage}!='Won', {Stage}!='Lost')"
  );
}

/** Schedule offsets for a follow-up kind. */
function followUpSchedule(kind, settings) {
  return kind === 'Quote'
    ? { offsets: numberList(settings['Quote Follow-up Days'], [2, 5, 10]), businessDays: false }
    : { offsets: numberList(settings['Enquiry Follow-up Business Days'], [1, 3]), businessDays: true };
}

function scheduleAt(base, offset, sched, hours) {
  if (sched.businessDays) return businessDayAt(base, offset, hours);
  const day = addDays(base, offset);
  const p = zonedParts(day, hours.tz);
  // Calendar days, delivered at opening time (moved to the next open day if closed).
  return businessDayAt(zonedToUtc(p.year, p.month, p.day, 0, 1, hours.tz), 0, hours);
}

/**
 * Decides, from the CURRENT lead row, whether a follow-up may go out.
 * Returns one plan per lead: { lead, action: 'email'|'task'|'stop'|'complete', ... }.
 */
function planFollowUp(lead, settings, now) {
  const f = lead.fields;
  const hours = hoursFrom(settings);
  const ref = f['Enquiry Ref'];
  const kind = f['Follow-up Kind'] === 'Quote' ? 'Quote' : 'Enquiry';
  const stop = (status, why) => ({ lead, action: 'stop', leadPatch: { 'Follow-up Status': status, 'Next Follow-up At': null }, why });

  if (f['Permission Withdrawn'] === true) return stop('Stopped', 'customer withdrew contact permission');
  if (f['Follow-up Status'] !== 'Active') return { lead, action: 'skip', why: 'follow-ups are ' + f['Follow-up Status'] };
  if (kind === 'Enquiry' && !['New', 'Contacting'].includes(f.Stage)) return stop('Not Needed', 'lead moved on to ' + f.Stage);
  if (kind === 'Quote' && f.Stage !== 'Quote Sent') return stop('Not Needed', 'lead is ' + f.Stage);
  if (f['Customer Replied At'] && f['Last Contact At'] && Date.parse(f['Customer Replied At']) >= Date.parse(f['Last Contact At'])) {
    return stop('Paused - Customer Replied', 'customer replied since our last message');
  }

  const sched = followUpSchedule(kind, settings);
  const step = (Number(f['Follow-up Step']) || 0) + 1;
  if (step > sched.offsets.length) {
    return {
      lead,
      action: 'complete',
      leadPatch: {
        'Follow-up Status': 'Completed',
        'Next Follow-up At': null,
        'Next Action': kind === 'Quote' ? 'No reply to quote follow-ups: call, or mark Lost' : 'No reply to follow-ups: call, or mark Lost',
        'Next Action Due': nextOpenMoment(now, hours).toISOString(),
      },
      task: 'All ' + sched.offsets.length + ' ' + kind.toLowerCase() + ' follow-ups done without a reply. Decide: call the customer or mark the lead Lost.',
    };
  }

  const base = new Date(f['Follow-up Base At'] || f['Received At'] || now);
  // After the last follow-up a closing check (2 days later) hands the lead to staff, so it never sits idle.
  const last = sched.offsets[sched.offsets.length - 1];
  const next = scheduleAt(base, step < sched.offsets.length ? sched.offsets[step] : last + 2, sched, hours).toISOString();
  const common = {
    'Follow-up Step': step,
    'Next Follow-up At': next,
  };
  if (step === sched.offsets.length) common['Next Action'] = 'Last automatic follow-up sent; staff will be asked to decide in 2 days if there is no reply';

  const byEmail = f['Preferred Contact'] === 'Email' && Boolean(f.Email);
  if (!byEmail) {
    return {
      lead,
      action: 'task',
      step,
      leadPatch: Object.assign({}, common, { 'Next Action': 'Follow-up call #' + step + ' (' + kind.toLowerCase() + ')', 'Next Action Due': nextOpenMoment(now, hours).toISOString() }),
      task: 'Follow-up call #' + step + ' about the ' + (kind === 'Quote' ? 'quote' : 'enquiry') + '. The customer prefers phone (' + (f.Phone || 'no number') + '), so no email was sent.',
    };
  }

  const messageKey = ref + '-FU-' + kind.toUpperCase() + '-' + step;
  if (hasInList(f['Sent Message Keys'], messageKey)) {
    return { lead, action: 'stop-dup', leadPatch: common, why: 'this follow-up was already sent' };
  }
  const threads = str(f['Gmail Thread IDs']).split('\n').filter(Boolean);
  const mail = customerEmail(kind === 'Quote' ? 'quote-follow-up' : 'enquiry-follow-up', {
    fullName: f['Full Name'],
    enquiryRef: ref,
    version: f['Current Quote Version'] || '',
    messageKey,
  }, settings);
  return {
    lead,
    action: 'email',
    step,
    messageKey,
    email: { to: f.Email, subject: mail.subject, text: mail.text, threadId: threads[threads.length - 1] || '' },
    leadPatch: common,
  };
}

/** Airtable PATCH bodies in chunks of 10 (the API maximum). */
function chunk(records, size) {
  const out = [];
  for (let i = 0; i < records.length; i += size || 10) out.push(records.slice(i, i + (size || 10)));
  return out;
}
