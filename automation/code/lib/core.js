// ROOFORA automation — shared helpers.
// Plain JavaScript with no imports: the build script pastes this file into
// n8n Code nodes, and the local tests load it the same way.

function str(v, max) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return max ? s.slice(0, max) : s;
}

function firstName(fullName) {
  return str(fullName).split(/\s+/)[0] || 'there';
}

/** Escapes a value for use inside a single-quoted Airtable formula string. */
function af(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function list(text) {
  return str(text)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function numberList(text, fallback) {
  const nums = list(text).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length ? nums : fallback;
}

// ---------- time zones (Intl only, no libraries) ----------

/** Calendar parts of an instant as seen in a time zone. */
function zonedParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
    weekday: p.weekday, // 'Mon'
  };
}

/** UTC instant for a wall-clock time in a time zone (handles DST). */
function zonedToUtc(year, month, day, hour, minute, tz) {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const wanted = Date.UTC(year, month - 1, day, hour, minute);
    if (shown === wanted) break;
    guess += wanted - shown;
  }
  return new Date(guess);
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

function hhmm(text, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(text));
  if (!m) return fallback;
  const h = +m[1];
  const mi = +m[2];
  return h < 24 && mi < 60 ? { h, mi } : fallback;
}

/** Reads the opening-hours part of Settings into one object. */
function hoursFrom(settings) {
  const days = Array.isArray(settings['Opening Days']) && settings['Opening Days'].length
    ? settings['Opening Days']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return {
    tz: str(settings['Business Timezone']),
    days,
    open: hhmm(settings['Opening Time'], { h: 8, mi: 0 }),
    close: hhmm(settings['Closing Time'], { h: 17, mi: 0 }),
  };
}

function isOpenDay(date, hours) {
  return hours.days.includes(zonedParts(date, hours.tz).weekday);
}

/** Opening time on the n-th business day after `from` (n=0: same day if open). */
function businessDayAt(from, n, hours, at) {
  const time = at || hours.open;
  let p = zonedParts(from, hours.tz);
  let cursor = zonedToUtc(p.year, p.month, p.day, 12, 0, hours.tz);
  let remaining = n;
  for (let guard = 0; guard < 60; guard++) {
    if (isOpenDay(cursor, hours)) {
      if (remaining === 0) {
        p = zonedParts(cursor, hours.tz);
        return zonedToUtc(p.year, p.month, p.day, time.h, time.mi, hours.tz);
      }
      remaining--;
    }
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000);
  }
  throw new Error('No opening days configured');
}

/** True when the instant is inside opening hours on an opening day. */
function isWithinHours(date, hours) {
  if (!isOpenDay(date, hours)) return false;
  const p = zonedParts(date, hours.tz);
  const mins = p.hour * 60 + p.minute;
  return mins >= hours.open.h * 60 + hours.open.mi && mins <= hours.close.h * 60 + hours.close.mi;
}

/** Next moment the business is open (now, if open now). */
function nextOpenMoment(now, hours) {
  if (isWithinHours(now, hours)) return now;
  const p = zonedParts(now, hours.tz);
  const mins = p.hour * 60 + p.minute;
  // Closed day, or before opening on an open day: the next opening is the first open day (n=0). After closing: the following one.
  const sameOrNext = !isOpenDay(now, hours) || mins < hours.open.h * 60 + hours.open.mi;
  return businessDayAt(now, sameOrNext ? 0 : 1, hours);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60 * 1000);
}

/** Customer-friendly date/time in the business time zone. */
function friendly(date, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Adds a key to a newline-separated list field, without duplicates. */
function addToList(text, value) {
  const items = str(text).split('\n').map((s) => s.trim()).filter(Boolean);
  if (value && !items.includes(value)) items.push(value);
  return items.join('\n');
}

function hasInList(text, value) {
  return str(text).split('\n').map((s) => s.trim()).includes(value);
}

/** Google Calendar event IDs must use characters a-v and 0-9. */
function calendarEventId(recordId) {
  let hex = '';
  for (const ch of String(recordId)) hex += ch.charCodeAt(0).toString(16).padStart(2, '0');
  return 'rfi' + hex;
}

/** Plain-language Airtable error text from an HTTP response (fullResponse mode). */
function httpProblem(res) {
  const code = res && res.statusCode;
  const body = (res && res.body) || {};
  const err = body.error;
  const detail = typeof err === 'string' ? err : (err && (err.message || err.type)) || '';
  return 'HTTP ' + (code || 'no response') + (detail ? ': ' + String(detail).slice(0, 200) : '');
}

function ok(res) {
  return res && res.statusCode >= 200 && res.statusCode < 300;
}

/** A "needs help" item for the ROOFORA error workflow (never includes customer details). */
function problemOf(step, ref, leadId, problem, action, executionId) {
  return { source: 'handled', step, ref: ref || '', leadId: leadId || '', problem: String(problem || ''), action: action || '', executionId: executionId || '' };
}
