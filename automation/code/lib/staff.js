// ROOFORA automation — staff actions started from Airtable buttons.
// Depends on core.js, email.js.

const STAFF_ACTIONS = {
  'book-inspection': { table: 'Inspections', label: 'Book or move this inspection' },
  'cancel-inspection': { table: 'Inspections', label: 'Cancel this inspection' },
  'complete-inspection': { table: 'Inspections', label: 'Mark this inspection as completed' },
  'send-quote': { table: 'Quotes', label: 'Send this approved quote' },
  'record-accepted': { table: 'Quotes', label: 'Record that the customer ACCEPTED this quote' },
  'record-declined': { table: 'Quotes', label: 'Record that the customer DECLINED this quote' },
};

function esc(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, bodyHtml, tone) {
  const colour = tone === 'bad' ? '#b42318' : tone === 'good' ? '#067647' : '#1e1e1e';
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>' + esc(title) + ' · ROOFORA</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#f7f3ee;color:#1e1e1e;margin:0;padding:24px}' +
    'main{max-width:560px;margin:40px auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.08)}' +
    'h1{font-size:22px;margin:0 0 12px;color:' + colour + '}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:16px 0}' +
    'dt{font-weight:600;color:#555}dd{margin:0;white-space:pre-line}button{font:inherit;font-weight:700;background:#ff8537;color:#fff;border:0;border-radius:999px;padding:14px 26px;cursor:pointer;min-height:48px}' +
    'button:focus-visible{outline:3px solid #1e1e1e;outline-offset:2px}.note{color:#555;font-size:14px}</style></head><body><main>' +
    '<h1>' + esc(title) + '</h1>' + bodyHtml + '</main></body></html>'
  );
}

/** Validates ?action=&record= from the button URL. */
function readStaffRequest(q) {
  const action = str(q && q.action);
  const record = str(q && q.record);
  if (!STAFF_ACTIONS[action]) return { valid: false, html: page('Unknown action', '<p>This button is not set up correctly. Check the button URL in Airtable.</p>', 'bad') };
  if (!/^rec[A-Za-z0-9]{14}$/.test(record)) return { valid: false, html: page('Missing record', '<p>The button did not send a record ID.</p>', 'bad') };
  return { valid: true, action, record, table: STAFF_ACTIONS[action].table };
}

/** Confirmation page shown on GET; nothing changes until the button is pressed. */
function confirmPage(req, rec, settings) {
  const f = (rec && rec.fields) || {};
  const tz = str(settings['Business Timezone']) || 'UTC';
  const rows = [];
  if (req.table === 'Inspections') {
    rows.push(['Inspection', f.Inspection], ['Status', f.Status || 'Requested']);
    if (f['Proposed Start']) rows.push(['Proposed time', friendly(new Date(f['Proposed Start']), tz)]);
    if (f['Confirmed Start']) rows.push(['Currently booked', friendly(new Date(f['Confirmed Start']), tz)]);
  } else {
    rows.push(['Quote', f.Quote], ['Version', f.Version], ['Amount', f.Amount], ['Approved', f.Approved ? 'Yes, by ' + (f['Approved By'] || '?') : 'No'], ['Status', f.Status || 'Draft']);
  }
  const dl = '<dl>' + rows.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>';
  const form =
    '<form method="post"><input type="hidden" name="action" value="' + esc(req.action) + '">' +
    '<input type="hidden" name="record" value="' + esc(req.record) + '"><button type="submit">' + esc(STAFF_ACTIONS[req.action].label) + '</button></form>' +
    '<p class="note">Nothing has changed yet. Close this tab to cancel.</p>';
  return page(STAFF_ACTIONS[req.action].label, dl + form);
}

/**
 * The POST must come from the confirmation page (same origin) — blocks other
 * websites from triggering staff actions with a saved browser login.
 */
function checkStaffOrigin(headers, n8nBaseUrl) {
  const origin = str(headers && (headers.origin || headers.Origin));
  const expected = str(n8nBaseUrl).replace(/\/+$/, '');
  if (!origin || !expected) return false;
  // n8n's Code-node sandbox has no URL global, so compare "scheme://host[:port]" with a plain pattern.
  const m = /^(https?:\/\/[^/?#]+)/i.exec(expected);
  return Boolean(m) && origin.toLowerCase() === m[1].toLowerCase();
}

function leadIdOf(rec) {
  const l = rec && rec.fields && rec.fields.Lead;
  return Array.isArray(l) && l.length ? l[0] : null;
}

// ---------------- inspections ----------------

/** Decides what a "Book" press should do. */
function planBooking(insp, lead, settings, now) {
  const f = insp.fields;
  const tz = str(settings['Business Timezone']) || 'UTC';
  const hours = hoursFrom(settings);
  const fail = (msg) => ({ go: false, message: msg });
  if (!str(settings['Calendar ID'])) return fail('Settings › Calendar ID is empty, so nothing can be booked.');
  if (!lead) return fail('This inspection is not linked to a lead.');
  if (f.Status === 'Completed') return fail('This inspection is already completed. Create a new inspection record to book another visit.');
  if (!f['Proposed Start']) return fail('Enter a Proposed Start time first.');
  const start = new Date(f['Proposed Start']);
  if (isNaN(start)) return fail('Proposed Start is not a valid date and time.');
  if (start.getTime() < now.getTime() + 30 * 60000) return fail('The proposed time is in the past or less than 30 minutes away.');
  const minutes = Number(f['Duration Minutes']) || Number(settings['Inspection Duration Minutes']) || 60;
  const end = addMinutes(start, minutes);
  if (!isWithinHours(start, hours) || !isWithinHours(end, hours) || zonedParts(start, tz).day !== zonedParts(end, tz).day) {
    return fail('The proposed time (' + friendly(start, tz) + ', ' + minutes + ' min) is outside opening hours in Settings.');
  }
  const version = Number(f['Booking Version']) || 0;
  const alreadyBooked = f.Status === 'Scheduled' && f['Confirmed Start'] && new Date(f['Confirmed Start']).getTime() === start.getTime();
  if (alreadyBooked) return { go: false, unchanged: true, message: 'Already booked for ' + friendly(start, tz) + '. Nothing changed.' };
  const buffer = Number(settings['Travel Buffer Minutes']) || 0;
  const eventId = str(f['Calendar Event ID']) || calendarEventId(insp.id);
  const isMove = f.Status === 'Scheduled' && Boolean(f['Confirmed Start']);
  return {
    go: true,
    isMove,
    start: start.toISOString(),
    end: end.toISOString(),
    newVersion: version + 1,
    eventId,
    eventExists: Boolean(str(f['Calendar Event ID'])),
    checkUrl:
      'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(settings['Calendar ID']) +
      '/events?singleEvents=true&maxResults=50&timeMin=' + encodeURIComponent(addMinutes(start, -buffer).toISOString()) +
      '&timeMax=' + encodeURIComponent(addMinutes(end, buffer).toISOString()),
  };
}

/** Any calendar event (other than this inspection's own) that blocks the slot. */
function findConflicts(res, ownEventId, tz) {
  if (!ok(res)) return { checked: false, message: 'Could not check the calendar (' + httpProblem(res) + '). Nothing was booked.' };
  const items = (res.body && res.body.items) || [];
  const clashes = items.filter((e) => e.id !== ownEventId && e.status !== 'cancelled' && e.transparency !== 'transparent');
  if (!clashes.length) return { checked: true, free: true };
  const first = clashes[0];
  const when = first.start && first.start.dateTime ? friendly(new Date(first.start.dateTime), tz) : 'an all-day event';
  return { checked: true, free: false, message: 'Not booked: the time clashes with "' + (first.summary || 'a calendar event') + '" (' + when + '), including travel buffer.' };
}

function eventBody(plan, lead, insp, settings) {
  const f = lead.fields;
  const tz = str(settings['Business Timezone']) || 'UTC';
  return {
    id: plan.eventId,
    status: 'confirmed',
    summary: 'Roof inspection — ' + f['Enquiry Ref'] + ' (' + (f.Town || '') + ')',
    location: [f.Town, f.Postcode].filter(Boolean).join(' '),
    description:
      'ROOFORA ' + f['Enquiry Ref'] + '\nCustomer: ' + (f['Full Name'] || '') + '\nPhone: ' + (f.Phone || '') +
      '\nService: ' + (f.Service || '') + '\nInspector: ' + (insp.fields.Inspector || 'not set') +
      '\nBooking version: ' + plan.newVersion,
    start: { dateTime: plan.start, timeZone: tz },
    end: { dateTime: plan.end, timeZone: tz },
  };
}

/** Interprets a calendar insert/patch response. 409 on insert = event already exists → patch it. */
function classifyCalendarSave(res, wasInsert) {
  if (ok(res)) return { saved: true, eventId: res.body.id };
  if (wasInsert && res && res.statusCode === 409) return { saved: false, retryAsPatch: true };
  return { saved: false, message: 'The calendar did not accept the booking (' + httpProblem(res) + '). Nothing was confirmed to the customer.' };
}

/** Reminder times (ISO) for a booking; null when already too late. */
function reminderTimes(startIso, now) {
  const start = new Date(startIso).getTime();
  const r24 = start - 24 * 3600e3;
  const r2 = start - 2 * 3600e3;
  return {
    at24: r24 > now.getTime() ? new Date(r24).toISOString() : null,
    at2: r2 > now.getTime() ? new Date(r2).toISOString() : null,
  };
}

/** Run when a reminder wait finishes: should it still be sent? */
function reminderStillDue(insp, version, which, now) {
  const f = insp.fields || {};
  if (f.Status !== 'Scheduled') return { due: false, why: 'inspection is ' + (f.Status || 'not scheduled') };
  if (Number(f['Booking Version']) !== Number(version)) return { due: false, why: 'booking changed since this reminder was planned' };
  const sentField = which === '24h' ? 'Reminder 24h Sent Version' : 'Reminder 2h Sent Version';
  if (Number(f[sentField]) === Number(version)) return { due: false, why: 'reminder already sent' };
  const start = new Date(f['Confirmed Start']).getTime();
  const lateLimit = which === '24h' ? 6 * 3600e3 : 45 * 60e3; // do not send a stale reminder
  if (now.getTime() > start - lateLimit) return { due: false, why: 'too late to remind' };
  return { due: true };
}

// ---------------- quotes ----------------

function moneyText(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(amount);
  } catch (e) {
    return (currency || '') + ' ' + Number(amount).toFixed(2);
  }
}

/** Checks a quote can be sent. Only staff-approved quotes ever leave. */
function planQuoteSend(quote, lead, settings, now) {
  const f = quote.fields;
  const fail = (msg) => ({ go: false, message: msg });
  if (!lead) return fail('This quote is not linked to a lead.');
  if (f.Status === 'Sent') return { go: false, unchanged: true, message: 'This quote was already sent on ' + f['Sent At'] + '. Nothing changed.' };
  if (f.Status && f.Status !== 'Draft') return fail('Only Draft quotes can be sent (this one is ' + f.Status + ').');
  if (f.Approved !== true || !str(f['Approved By'])) return fail('Tick Approved and fill in Approved By before sending.');
  if (!(Number(f.Amount) > 0)) return fail('Enter the quoted Amount.');
  if (str(f.Scope).length < 10) return fail('Write the Scope of work before sending.');
  if (!(Number(f.Version) >= 1)) return fail('Enter the quote Version number (1 for the first quote).');
  if (lead.fields.Stage === 'Won' || lead.fields.Stage === 'Lost') return fail('The lead is already ' + lead.fields.Stage + '.');
  const site = str(settings['Website URL']);
  if (/^https?:\/\/(localhost|127\.|\[::1\])/i.test(site) && lead.fields.Environment && lead.fields.Environment !== 'development') {
    return fail('Settings › Website URL is still ' + site + ', but this enquiry came from the ' + lead.fields.Environment + ' website. Set Website URL to the deployed address first, otherwise the customer\'s quote link would not open.');
  }
  const validDays = Number(settings['Quote Link Valid Days']) || 30;
  const lf = lead.fields;
  const byEmail = lf['Preferred Contact'] === 'Email' && Boolean(lf.Email) && lf['Permission Withdrawn'] !== true;
  const key = lf['Enquiry Ref'] + '-Q' + f.Version;
  return {
    go: true,
    byEmail,
    version: Number(f.Version),
    messageKey: key,
    alreadyEmailed: hasInList(lf['Sent Message Keys'], key),
    expiresAt: addDays(now, validDays).toISOString(),
    amountText: moneyText(Number(f.Amount), str(settings.Currency) || 'GBP'),
    supersedeFormula: "{Status}='Sent'", // matched to this lead in code, so no formula depends on the Leads primary field
  };
}

/** Outcome of an accept/decline (online or recorded by staff). */
/** Reasons an answer cannot be recorded (needs no settings). null = may proceed. */
function quoteAnswerBlocked(quote, answer, viaStaff, now) {
  const f = quote.fields;
  if (f.Status === 'Accepted' && answer === 'accept') return { go: false, same: true, result: 'already-accepted' };
  if (f.Status === 'Declined' && answer === 'decline') return { go: false, same: true, result: 'already-declined' };
  if (f.Status !== 'Sent') return { go: false, result: 'not-open', message: 'This quote is ' + (f.Status || 'not sent') + ' and cannot be answered.' };
  if (!viaStaff && f['Link Expires At'] && Date.parse(f['Link Expires At']) < now.getTime()) {
    return { go: false, result: 'expired', message: 'This quote link has expired.' };
  }
  return null;
}

function planQuoteAnswer(quote, lead, answer, viaStaff, now, settings) {
  const f = quote.fields;
  const tz = str(settings['Business Timezone']) || 'UTC';
  const blocked = quoteAnswerBlocked(quote, answer, viaStaff, now);
  if (blocked) return blocked;
  const nowIso = now.toISOString();
  const lf = lead.fields;
  const hours = hoursFrom(settings);
  if (answer === 'accept') {
    return {
      go: true,
      result: 'accepted',
      quotePatch: { Status: 'Accepted', 'Customer Response': viaStaff ? 'Accepted (recorded by staff)' : 'Accepted online', 'Response At': nowIso },
      leadPatch: {
        Stage: 'Won',
        'Follow-up Status': 'Completed',
        'Next Follow-up At': null,
        'Next Action': 'Schedule the job: agree a date with the customer (not yet promised)',
        'Next Action Due': businessDayAt(now, 1, hours).toISOString(),
        'Last Contact At': nowIso,
        'Last Contact Summary': 'Quote v' + f.Version + ' accepted' + (viaStaff ? ' (recorded by staff)' : ' online'),
      },
      task: {
        Activity: 'Schedule job — ' + lf['Enquiry Ref'],
        Type: 'Task',
        Status: 'Open',
        Owner: lf.Owner || undefined,
        'Due At': businessDayAt(now, 1, hours).toISOString(),
        Details: 'Quote v' + f.Version + ' (' + moneyText(Number(f.Amount), str(f.Currency || settings.Currency)) + ') accepted ' + friendly(now, tz) + '. Contact the customer to agree a job date. Deposits/payments are handled outside this system.',
      },
      alert: '🎉 ' + lf['Enquiry Ref'] + ' ACCEPTED quote v' + f.Version + ' (' + moneyText(Number(f.Amount), str(f.Currency || settings.Currency)) + ').' + ' Job-scheduling task created for ' + (lf.Owner || 'the owner') + '.',
      emailCustomer: !viaStaff,
    };
  }
  return {
    go: true,
    result: 'declined',
    quotePatch: { Status: 'Declined', 'Customer Response': viaStaff ? 'Declined (recorded by staff)' : 'Declined online', 'Response At': nowIso },
    leadPatch: {
      Stage: 'Lost',
      'Lost Reason': 'Declined quote v' + f.Version,
      'Follow-up Status': 'Stopped',
      'Next Follow-up At': null,
      'Next Action': 'None (quote declined)',
      'Last Contact At': nowIso,
      'Last Contact Summary': 'Quote v' + f.Version + ' declined',
    },
    task: {
      Activity: 'Quote declined — ' + lf['Enquiry Ref'],
      Type: 'Status Change',
      Status: 'Info',
      Details: 'Quote v' + f.Version + ' declined' + (viaStaff ? ' (recorded by staff).' : ' online.'),
    },
    alert: 'ℹ️ ' + lf['Enquiry Ref'] + ' declined quote v' + f.Version + '. Lead marked Lost.',
    emailCustomer: false,
  };
}

/** What the website quote page may show (no internal fields). */
function quoteView(quote, lead, now) {
  const f = quote.fields;
  let status = f.Status;
  if (status === 'Sent' && f['Link Expires At'] && Date.parse(f['Link Expires At']) < now.getTime()) status = 'Expired';
  if (!['Sent', 'Accepted', 'Declined', 'Superseded', 'Expired'].includes(status)) status = 'Expired';
  return {
    enquiryRef: lead ? lead.fields['Enquiry Ref'] : '',
    firstName: lead ? firstName(lead.fields['Full Name']) : '',
    version: Number(f.Version) || 1,
    amount: Number(f.Amount) || 0,
    currency: str(f.Currency) || 'GBP',
    scope: str(f.Scope),
    validUntil: f['Link Expires At'] || null,
    status,
  };
}
