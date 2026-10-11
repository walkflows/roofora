// ROOFORA automation — customer email wording and Gmail message building.
// Depends on core.js. Wording never promises attendance times, prices or
// emergency visits beyond what staff have explicitly confirmed.

function signOff(settings) {
  const name = str(settings['Business Name']) || 'ROOFORA';
  const phone = str(settings['Business Phone']);
  return '\n\nKind regards,\nThe ' + name + ' team' + (phone ? '\n' + phone : '');
}

function footer(messageKey) {
  return (
    '\n\n—\nYou are receiving this because you asked us to contact you about your roofing enquiry. ' +
    'If you would rather we did not email you again, reply with the word STOP.\n' +
    'Message reference: ' + messageKey
  );
}

/**
 * Builds { subject, text } for a customer email.
 * kind: ack | enquiry-follow-up | inspection-booked | inspection-moved | inspection-cancelled |
 *       reminder-24h | reminder-2h | quote | quote-follow-up | quote-accepted
 */
function customerEmail(kind, ctx, settings) {
  const first = firstName(ctx.fullName);
  const ref = ctx.enquiryRef;
  const tz = str(settings['Business Timezone']) || 'UTC';
  const business = str(settings['Business Name']) || 'ROOFORA';
  const phone = str(settings['Business Phone']);
  const when = ctx.start ? friendly(new Date(ctx.start), tz) : '';
  let subject;
  let text;

  switch (kind) {
    case 'ack':
      subject = 'We have received your roofing enquiry (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nThank you for contacting ' + business + ' about ' + String(ctx.service).toLowerCase() +
        ' in ' + ctx.town + '. We have received your enquiry and a member of our team will email you about the next step, which is usually a roof inspection.' +
        (ctx.urgent
          ? '\n\nWe have flagged your enquiry as urgent. Please note this email does not confirm an emergency visit.' +
            (phone ? ' If water is coming in now, please call us on ' + phone + '.' : '')
          : '') +
        '\n\nIf it helps, reply to this email with the days and times that usually suit you for an inspection.' +
        '\n\nYour reference: ' + ref;
      break;
    case 'enquiry-follow-up':
      subject = 'Re: We have received your roofing enquiry (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nWe wanted to check in about your roofing enquiry (' + ref + '). If you would still like us to take a look, just reply with a few days and times that suit you for an inspection.' +
        '\n\nIf you no longer need help, no problem — reply and let us know and we will close your enquiry.';
      break;
    case 'inspection-booked':
      subject = 'Your roof inspection is booked for ' + when + ' (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nYour roof inspection is confirmed for ' + when + ' at your property in ' + ctx.town + '.' +
        '\n\nIf this time no longer suits you, reply to this email' + (phone ? ' or call ' + phone : '') + ' and we will arrange another.' +
        '\n\nFor your safety, please do not go onto the roof before we arrive.';
      break;
    case 'inspection-moved':
      subject = 'Your roof inspection has moved to ' + when + ' (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nYour roof inspection has been rescheduled to ' + when + '. Please ignore any earlier time we sent you.' +
        '\n\nIf this time does not suit you, reply to this email' + (phone ? ' or call ' + phone : '') + '.';
      break;
    case 'inspection-cancelled':
      subject = 'Your roof inspection has been cancelled (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nYour roof inspection planned for ' + when + ' has been cancelled.' +
        '\n\nIf you would like to arrange a new time, reply to this email' + (phone ? ' or call ' + phone : '') + '.';
      break;
    case 'reminder-24h':
    case 'reminder-2h':
      subject = 'Reminder: roof inspection ' + (kind === 'reminder-2h' ? 'today at ' : 'on ') + when + ' (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nThis is a reminder of your roof inspection on ' + when + ' in ' + ctx.town + '.' +
        '\n\nIf you need to change it, reply to this email' + (phone ? ' or call ' + phone : '') + '.';
      break;
    case 'quote':
      subject = 'Your roofing quote from ' + business + ' (' + ref + ', version ' + ctx.version + ')';
      text =
        'Hi ' + first + ',\n\nThank you for letting us inspect your roof. Here is your quote.' +
        '\n\nScope of work:\n' + ctx.scope +
        '\n\nPrice: ' + ctx.amountText +
        '\n\nTo accept or decline, use this secure link (valid until ' + ctx.validUntilText + '):\n' + ctx.link +
        '\n\nHave a question? Simply reply to this email.' +
        '\n\nAccepting the quote does not book a date yet — we will contact you to agree a date for the work.';
      break;
    case 'quote-follow-up':
      subject = 'Re: Your roofing quote from ' + business + ' (' + ref + ', version ' + ctx.version + ')';
      text =
        'Hi ' + first + ',\n\nWe wanted to check whether you had any questions about your roofing quote (' + ref + ').' +
        '\n\nYou can accept or decline using the secure link in our quote email, or simply reply to this email and we will help.';
      break;
    case 'quote-accepted':
      subject = 'Thank you — your quote is accepted (' + ref + ')';
      text =
        'Hi ' + first + ',\n\nThank you for accepting quote version ' + ctx.version + '. We will contact you shortly to agree a date for the work. No date is booked until we confirm it with you.';
      break;
    default:
      throw new Error('Unknown email kind: ' + kind);
  }
  return { subject, text: text + signOff(settings) + footer(ctx.messageKey) };
}

/** Encodes a header value as RFC 2047 UTF-8 when needed. */
function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=';
}

/**
 * Applies the safety switches and builds a Gmail API message.
 * Returns { send: false, reason } or { send: true, raw, threadId, to, subject, searchQuery }.
 */
function prepareEmail(input) {
  const s = input.settings || {};
  if (s['Customer Emails Enabled'] !== true) return { send: false, reason: 'Customer emails are switched off in Settings.' };
  if (input.permissionWithdrawn) return { send: false, reason: 'Customer withdrew contact permission.' };
  const sender = str(s['Sender Email']);
  if (!sender) return { send: false, reason: 'Settings › Sender Email is empty.' };
  let to = str(input.to).toLowerCase();
  let subject = input.subject;
  if (s['Test Mode'] === true) {
    const testTo = str(s['Test Recipient Email']).toLowerCase();
    if (!testTo) return { send: false, reason: 'Test Mode is on but Test Recipient Email is empty.' };
    subject = '[TEST for ' + (to || 'no address') + '] ' + subject;
    to = testTo;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { send: false, reason: 'No valid email address for this customer.' };
  // Hard allowlist: checked AFTER the test-mode redirect, so nothing can reach an address that is not listed.
  const allowed = list(s['Email Allowlist']).map((a) => a.toLowerCase());
  if (allowed.length && !allowed.includes(to)) return { send: false, reason: 'Recipient is not on the Email Allowlist in Settings, so nothing was sent.' };

  const fromName = (str(s['Sender Name']) || str(s['Business Name']) || 'ROOFORA').replace(/["\r\n]/g, '');
  const headers = [
    'From: ' + encodeHeader(fromName) + ' <' + sender + '>',
    'To: ' + to,
    'Subject: ' + encodeHeader(subject.replace(/[\r\n]+/g, ' ')),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
  ];
  const bodyB64 = Buffer.from(input.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + bodyB64, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return {
    send: true,
    raw,
    threadId: str(input.threadId) || undefined,
    to,
    subject,
    // The message key is printed in every email body, so a sent copy can be
    // found again after a timeout instead of sending blindly a second time.
    searchQuery: 'in:sent "' + input.messageKey + '"',
  };
}

/** Classifies a Gmail send response (HTTP Request in fullResponse/neverError mode). */
function classifySend(res) {
  if (ok(res) && res.body && res.body.id) return { status: 'sent', messageId: res.body.id, threadId: res.body.threadId };
  const code = res && res.statusCode;
  if (code === 400 || code === 403 || code === 404) return { status: 'failed', reason: httpProblem(res) };
  return { status: 'uncertain', reason: httpProblem(res) };
}

/** After an uncertain send: did Gmail Sent find the message? */
function classifySearch(res) {
  if (!ok(res)) return { found: null, reason: httpProblem(res) };
  const msgs = (res.body && res.body.messages) || [];
  return msgs.length ? { found: true, messageId: msgs[0].id, threadId: msgs[0].threadId } : { found: false };
}
