// ROOFORA automation — classify incoming Gmail messages.
// Depends on core.js.

function headerMap(msg) {
  const out = {};
  const h = msg.headers || {};
  if (Array.isArray(h)) {
    for (const x of h) if (x && x.name) out[String(x.name).toLowerCase()] = String(x.value || '');
  } else {
    for (const k of Object.keys(h)) out[k.toLowerCase()] = String(h[k] || '');
  }
  if (msg.payload && Array.isArray(msg.payload.headers)) {
    for (const x of msg.payload.headers) out[String(x.name).toLowerCase()] = String(x.value || '');
  }
  return out;
}

function senderAddress(msg, headers) {
  const v = msg.from && msg.from.value && msg.from.value[0] && msg.from.value[0].address;
  if (v) return String(v).toLowerCase();
  const m = /<([^>]+)>/.exec(headers.from || '') || /([^\s<>]+@[^\s<>]+)/.exec(headers.from || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Returns { kind, ref, threadId, from, snippet } where kind is one of:
 *   'ignore' (our own mail / not for ROOFORA), 'bounce', 'auto-reply', 'stop', 'reply'
 */
function classifyIncoming(msg, ownAddress) {
  const headers = headerMap(msg);
  const from = senderAddress(msg, headers);
  const subject = str(msg.subject || headers.subject);
  const text = str(msg.text || msg.textPlain || msg.snippet || '');
  const refMatch = /RF-[0-9A-F]{8}/.exec(subject + '\n' + text);
  const base = {
    threadId: str(msg.threadId),
    messageId: str(msg.id),
    from,
    subject: subject.slice(0, 150),
    ref: refMatch ? refMatch[0] : null,
    date: msg.internalDate ? Number(msg.internalDate) : (Date.parse(msg.date || '') || 0),
  };

  if (ownAddress && from === String(ownAddress).toLowerCase()) return Object.assign({ kind: 'ignore', why: 'sent by us' }, base);

  const isBounce =
    /^(mailer-daemon|postmaster)@/.test(from) ||
    /delivery status notification|undeliverable|mail delivery failed|returned mail|delivery has failed/i.test(subject) ||
    /multipart\/report.*delivery-status/i.test(headers['content-type'] || '');
  if (isBounce) return Object.assign({ kind: 'bounce' }, base);

  // Newsletters and bulk mail never concern a customer: skip them before they cost an Airtable lookup.
  if ('list-unsubscribe' in headers || /^(bulk|junk|list)$/i.test(headers.precedence || '')) return Object.assign({ kind: 'ignore', why: 'bulk mail' }, base);

  const auto = (headers['auto-submitted'] || '').toLowerCase();
  const isAuto =
    (auto && auto !== 'no') ||
    'x-autoreply' in headers ||
    'x-autorespond' in headers ||
    /^auto_reply$/i.test(headers.precedence || '') ||
    /^(automatic reply|auto(-|\s)?reply|out of (the )?office|autoreply)/i.test(subject.replace(/^(re|aw|fw|fwd):\s*/i, ''));
  if (isAuto) return Object.assign({ kind: 'auto-reply' }, base);

  // A reply whose first written line is just STOP / unsubscribe withdraws permission.
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('>')) || '';
  if (/^(stop|unsubscribe|stop emailing( me)?|please stop)[.!]?$/i.test(firstLine)) return Object.assign({ kind: 'stop' }, base);

  return Object.assign({ kind: 'reply', snippet: text.slice(0, 300) }, base);
}

/**
 * STAGE 1 — exact. A Gmail thread id or an RF- reference identifies at most a handful of rows, so this lookup is narrow
 * by construction: no row limit can hide the right enquiry, however many enquiries share the customer's address.
 */
function exactLookupFormula(c) {
  const parts = [];
  if (c.threadId) parts.push('FIND(' + af(c.threadId) + ', {Gmail Thread IDs})');
  if (c.ref) parts.push('{Enquiry Ref} = ' + af(c.ref));
  return parts.length ? 'OR(' + parts.join(', ') + ')' : null;
}

/**
 * STAGE 2 — only when stage 1 found nothing: OPEN enquiries with the sender's address. We only need to know whether there
 * is exactly one, so a page of up to 100 is enough (more than one = ambiguous, however many).
 */
function addressLookupFormula(c) {
  if (c.kind === 'bounce' || !c.from) return null;
  return 'AND(LOWER({Email}) = ' + af(c.from) + ", {Stage} != 'Won', {Stage} != 'Lost', {Stage} != 'Duplicate')";
}

const refsOf = (rows) => rows.map((r) => r.fields['Enquiry Ref']).filter(Boolean);

/** Stage 1 result: { lead, how } | { ambiguous: [refs], how } | null (nothing exact). Never picks between several. */
function matchExact(records, c) {
  const threadIds = (r) => str(r.fields['Gmail Thread IDs']).split('\n').map((x) => x.trim());
  const byThread = records.filter((r) => c.threadId && threadIds(r).includes(c.threadId));
  if (byThread.length === 1) return { lead: byThread[0], how: 'thread' };
  if (byThread.length > 1) return { ambiguous: refsOf(byThread), how: 'several enquiries share this Gmail thread' };
  const byRef = records.filter((r) => c.ref && r.fields['Enquiry Ref'] === c.ref);
  if (byRef.length === 1) return { lead: byRef[0], how: 'reference' };
  if (byRef.length > 1) return { ambiguous: refsOf(byRef), how: 'several enquiries share this reference' };
  return null;
}

/** Stage 2 result: { lead, how } | { ambiguous: [refs], how } | null. Exactly one open enquiry or nothing is chosen. */
function matchByAddress(records, c) {
  const open = records.filter((r) => c.from && str(r.fields.Email).toLowerCase() === c.from && !['Won', 'Lost', 'Duplicate'].includes(r.fields.Stage));
  if (open.length === 1) return { lead: open[0], how: 'sender address (only one open enquiry)' };
  if (open.length > 1) return { ambiguous: refsOf(open), how: 'several open enquiries use this address' };
  return null;
}

/** Staff task for a message that could not be matched to ONE enquiry (nothing is changed automatically). */
function planUnmatched(c, ambiguous, now) {
  const shown = ambiguous.slice(0, 8).join(', ') + (ambiguous.length > 8 ? ' … (+' + (ambiguous.length - 8) + ' more)' : '');
  return {
    activity: {
      Activity: 'Reply needs matching — ' + (c.from || 'unknown sender'),
      Type: 'Email Received',
      Status: 'Needs My Help',
      Details: 'An email from ' + (c.from || 'an unknown sender') + ' ("' + String(c.subject || '').slice(0, 120) + '") could not be matched to ONE enquiry (candidates: ' + shown + '). Nothing was changed automatically. Open the Gmail message and update the right enquiry by hand.',
      'Provider ID': c.messageId,
      'Workflow Step': 'Reply detection',
      'Created At': now.toISOString(),
    },
    alert: '✉️ A ' + c.kind + ' from ' + (c.from || 'an unknown sender') + ' matches ' + ambiguous.length + ' enquiries (' + shown + '). I did not guess: please check the inbox and update the right one.',
  };
}

/** Lead update + activity for a classified, matched message. */
function planReply(c, lead, now) {
  const f = lead.fields;
  const nowIso = now.toISOString();
  const leadPatch = {};
  let activity;
  let alert;
  if (c.kind === 'bounce') {
    leadPatch['Follow-up Status'] = 'Paused - Email Bounced';
    leadPatch['Next Action'] = 'Email bounced: check the address or phone the customer';
    leadPatch['Next Action Due'] = nowIso;
    activity = { Type: 'Email Bounced', Status: 'Open', Details: 'Our email to this customer bounced. Subject: ' + c.subject };
    alert = '⚠️ Email to ' + f['Enquiry Ref'] + ' bounced. Follow-ups paused; please check the address or call.';
  } else if (c.kind === 'auto-reply') {
    activity = { Type: 'Auto-reply', Status: 'Info', Details: 'Automatic reply received (follow-ups continue). Subject: ' + c.subject };
  } else if (c.kind === 'stop') {
    leadPatch['Permission Withdrawn'] = true;
    leadPatch['Follow-up Status'] = 'Stopped';
    leadPatch['Next Action'] = 'Customer asked us to stop emailing — no further automated contact';
    leadPatch['Customer Replied At'] = nowIso;
    activity = { Type: 'Email Received', Status: 'Done', Details: 'Customer replied STOP. Contact permission withdrawn automatically.' };
    alert = '🛑 ' + f['Enquiry Ref'] + ' replied STOP. Automated emails stopped.';
  } else {
    const followUpActive = f['Follow-up Status'] === 'Active';
    leadPatch['Customer Replied At'] = nowIso;
    leadPatch['Last Contact At'] = nowIso;
    leadPatch['Last Contact Summary'] = 'Customer replied by email';
    if (followUpActive) leadPatch['Follow-up Status'] = 'Paused - Customer Replied';
    leadPatch['Next Action'] = 'Reply to the customer\'s email';
    leadPatch['Next Action Due'] = nowIso;
    activity = { Type: 'Email Received', Status: 'Open', Details: 'Customer replied. "' + (c.snippet || '').slice(0, 200) + '"' };
    alert = '✉️ ' + f['Enquiry Ref'] + ' (' + (f['Full Name'] || '') + ') replied by email. Follow-ups paused. Owner: ' + (f.Owner || '—');
  }
  return {
    leadPatch,
    activity: Object.assign(
      {
        Activity: activity.Type + ' — ' + f['Enquiry Ref'],
        Lead: [lead.id],
        'Provider ID': c.messageId,
        Owner: f.Owner || undefined,
        'Workflow Step': 'Reply detection',
        'Created At': nowIso,
      },
      activity
    ),
    alert,
  };
}
