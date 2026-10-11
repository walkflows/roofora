// ROOFORA automation — website enquiry intake and qualification.
// Depends on core.js (pasted before this file).

const INTAKE = {
  propertyTypes: ['Residential', 'Commercial', 'Other'],
  services: ['Roof Installation', 'Roof Repair', 'Roof Replacement', 'Commercial Roofing', 'Storm & Leak Response', 'Roof Inspections', 'Not sure yet'],
  urgencies: ['Urgent active leak/storm damage', 'This week', 'This month', 'Just researching'],
  urgent: 'Urgent active leak/storm damage',
  environments: ['development', 'preview', 'production'],
  allowedKeys: ['contractVersion', 'source', 'environment', 'enquiryRef', 'receivedAt', 'submissionId', 'fullName', 'phone', 'email', 'propertyType', 'service', 'town', 'postcode', 'details', 'urgency', 'preferredContact', 'photoCount', 'consent'],
};

/** Reads the single Settings row and reports anything that needs fixing. */
function readSettings(res) {
  const problems = [];
  const rec = res && res.body && Array.isArray(res.body.records) ? res.body.records[0] : null;
  if (!ok(res) || !rec) {
    problems.push('Settings could not be read (' + httpProblem(res) + '). Safe defaults were used and no customer email was sent.');
  }
  const s = Object.assign({}, rec ? rec.fields : {});
  if (!isValidTimeZone(str(s['Business Timezone']))) {
    if (rec) problems.push('Settings › Business Timezone "' + str(s['Business Timezone']) + '" is not a valid time zone name (e.g. Europe/London). UTC was used.');
    s['Business Timezone'] = 'UTC';
  }
  // Without readable settings, never send customer emails.
  if (!rec) s['Customer Emails Enabled'] = false;
  return { settings: s, problems, recordId: rec ? rec.id : null };
}

/** Checks the website → n8n payload. Returns { valid, errors, data }. */
function checkEnquiryPayload(body) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};
  for (const key of Object.keys(b)) {
    if (!INTAKE.allowedKeys.includes(key)) errors._unexpected = 'Unexpected field: ' + key;
  }
  const sid = str(b.submissionId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sid)) errors.submissionId = 'Invalid submission ID.';
  if (b.contractVersion !== 1) errors.contractVersion = 'Unsupported contract version.';
  const fullName = str(b.fullName, 100);
  if (fullName.length < 2) errors.fullName = 'Please enter your full name.';
  const phone = str(b.phone, 30);
  if (!/^\+?\d{7,15}$/.test(phone)) errors.phone = 'Please enter a valid phone number.';
  const preferred = b.preferredContact === 'Email' ? 'Email' : b.preferredContact === 'Phone' ? 'Phone' : '';
  if (!preferred) errors.preferredContact = 'Please choose a contact method.';
  const email = str(b.email, 200).toLowerCase();
  if (preferred === 'Email' && !email) errors.email = 'Please enter your email address.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Please enter a valid email address.';
  if (!INTAKE.propertyTypes.includes(b.propertyType)) errors.propertyType = 'Please choose a property type.';
  if (!INTAKE.services.includes(b.service)) errors.service = 'Please choose a service.';
  const town = str(b.town, 80);
  if (town.length < 2) errors.town = 'Please enter the town or city.';
  if (!INTAKE.urgencies.includes(b.urgency)) errors.urgency = 'Please tell us how soon you need help.';
  const consent = b.consent || {};
  if (consent.given !== true || !str(consent.wording) || !str(consent.version)) errors.consent = 'Contact permission is required.';
  const photoCount = Number(b.photoCount);
  if (!Number.isInteger(photoCount) || photoCount < 0 || photoCount > 3) errors.photos = 'Up to 3 photos.';
  const expectedRef = 'RF-' + sid.replace(/-/g, '').slice(0, 8).toUpperCase();
  if (sid && str(b.enquiryRef) !== expectedRef) errors.enquiryRef = 'Reference mismatch.';

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    errors: {},
    data: {
      submissionId: sid,
      enquiryRef: expectedRef,
      receivedAt: isNaN(Date.parse(b.receivedAt)) ? new Date().toISOString() : new Date(b.receivedAt).toISOString(),
      environment: INTAKE.environments.includes(b.environment) ? b.environment : 'development',
      fullName,
      phone,
      email: email || null,
      preferredContact: preferred,
      propertyType: b.propertyType,
      service: b.service,
      town,
      postcode: str(b.postcode, 12).toUpperCase() || null,
      details: str(b.details, 2000) || null,
      urgency: b.urgency,
      photoCount,
      consent: { wording: str(consent.wording, 500), version: str(consent.version, 60), recordedAt: isNaN(Date.parse(consent.recordedAt)) ? new Date().toISOString() : new Date(consent.recordedAt).toISOString() },
    },
  };
}

function normalisePostcode(v) {
  return str(v).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Outward code: the part before the space (UK style), or all but the last 3 characters when typed without a space. */
function outwardCode(postcode) {
  const pc = normalisePostcode(postcode);
  if (pc.includes(' ')) return pc.split(' ')[0];
  return pc.length >= 5 ? pc.slice(0, -3) : pc;
}

/**
 * A prefix ending in a digit (SE1, CR0) must equal the outward code, so SE1 never matches SE10.
 * A letters-only prefix (SW, CR) matches any outward code that continues with a digit (SW19).
 */
function postcodeMatches(postcode, prefix) {
  const out = outwardCode(postcode);
  const pre = normalisePostcode(prefix).replace(/ /g, '');
  if (!out || !pre) return false;
  if (out === pre) return true;
  return /^[A-Z]+$/.test(pre) && out.startsWith(pre) && /\d/.test(out[pre.length] || '');
}

/** Service-area check. Never returns "Out of Area" — only staff decide that. */
function checkServiceArea(town, postcode, settings) {
  const prefixes = list(settings['Service Area Postcode Prefixes']);
  const towns = list(settings['Service Area Towns']).map((t) => t.toLowerCase());
  if (!prefixes.length && !towns.length) return { area: 'Not Checked', note: 'No service area is set in Settings.' };
  const pcMatch = postcode ? prefixes.some((p) => postcodeMatches(postcode, p)) : false;
  const townMatch = towns.includes(str(town).toLowerCase());
  if (pcMatch) return { area: 'In Area', note: 'Postcode is inside the service area.' };
  if (townMatch && (!postcode || !prefixes.length)) return { area: 'In Area', note: 'Town is inside the service area.' };
  if (townMatch) return { area: 'Needs Review', note: 'Town is listed but the postcode is not; please check.' };
  if (postcode && prefixes.length) return { area: 'Possibly Out of Area', note: 'Postcode not in the listed area; please check before replying.' };
  return { area: 'Needs Review', note: 'Location could not be matched automatically; please check.' };
}

/** Owner, priority, next action and follow-up plan for a new lead. */
function qualifyLead(data, settings, now) {
  const hours = hoursFrom(settings);
  const urgent = data.urgency === INTAKE.urgent;
  const area = checkServiceArea(data.town, data.postcode, settings);
  const owner = (urgent && str(settings['Urgent Owner'])) || str(settings['Default Owner']) || 'Office';
  const checkArea = area.area === 'Needs Review' || area.area === 'Possibly Out of Area';
  const phonePref = data.preferredContact === 'Phone';

  let nextAction;
  let due;
  if (urgent) {
    nextAction = 'URGENT: call customer back' + (checkArea ? ' (check service area)' : '');
    due = now;
  } else if (phonePref) {
    nextAction = (checkArea ? 'Check service area, then ' : '') + 'call customer back to arrange an inspection';
    due = addMinutes(nextOpenMoment(now, hours), 240);
  } else {
    nextAction = (checkArea ? 'Check service area, then ' : '') + 'email customer to arrange an inspection';
    due = addMinutes(nextOpenMoment(now, hours), 240);
  }

  const followDays = numberList(settings['Enquiry Follow-up Business Days'], [1, 3]);
  return {
    priority: urgent ? 'Urgent' : 'Normal',
    urgent,
    owner,
    area,
    nextAction,
    nextActionDue: due.toISOString(),
    followUp: {
      status: 'Active',
      kind: 'Enquiry',
      step: 0,
      nextAt: businessDayAt(now, followDays[0], hours).toISOString(),
    },
    sendAcknowledgement: !phonePref && Boolean(data.email),
    callbackTask: phonePref || urgent,
  };
}

/** Airtable fields for the new lead (create only; never used to overwrite). */
function leadFields(data, q) {
  return {
    'Enquiry Ref': data.enquiryRef,
    'Submission ID': data.submissionId,
    'Received At': data.receivedAt,
    Environment: data.environment,
    'Full Name': data.fullName,
    Phone: data.phone,
    Email: data.email || undefined,
    'Preferred Contact': data.preferredContact,
    'Property Type': data.propertyType,
    Service: data.service,
    Town: data.town,
    Postcode: data.postcode || undefined,
    'Roof Details': data.details || undefined,
    Urgency: data.urgency,
    Priority: q.priority,
    'Photos Expected': data.photoCount,
    'Contact Permission': true,
    'Permission Wording': data.consent.wording,
    'Permission Version': data.consent.version,
    'Permission Recorded At': data.consent.recordedAt,
    Stage: 'New',
    'Service Area': q.area.area,
    Owner: q.owner,
    'Next Action': q.nextAction,
    'Next Action Due': q.nextActionDue,
    'Follow-up Status': q.followUp.status,
    'Follow-up Kind': q.followUp.kind,
    'Follow-up Step': q.followUp.step,
    'Follow-up Base At': data.receivedAt,
    'Next Follow-up At': q.followUp.nextAt,
  };
}

/**
 * Duplicate guard after creating a lead. Every execution that created a row
 * for this Submission ID looks at all rows with that ID; only the earliest
 * (createdTime, then record ID) carries on. Later rows mark themselves as
 * duplicates and send nothing.
 */
function pickWinner(records) {
  const sorted = records.slice().sort((a, b) => {
    const t = Date.parse(a.createdTime) - Date.parse(b.createdTime);
    return t !== 0 ? t : a.id < b.id ? -1 : 1;
  });
  return sorted[0];
}

function telegramNewLead(data, q, leadUrl) {
  const lines = [
    (q.urgent ? '🚨 URGENT roofing enquiry ' : '🏠 New roofing enquiry ') + data.enquiryRef + (data.environment !== 'production' ? ' [' + data.environment.toUpperCase() + ']' : ''),
    data.fullName + ' — ' + data.service + ' (' + data.propertyType + ')',
    'Where: ' + data.town + (data.postcode ? ' ' + data.postcode : '') + ' · Area: ' + q.area.area,
    'How soon: ' + data.urgency,
    'Prefers: ' + (data.preferredContact === 'Phone' ? 'phone call — ' + data.phone : 'email'),
    data.photoCount ? 'Photos: ' + data.photoCount + ' uploading' : null,
    'Owner: ' + q.owner + ' · Next: ' + q.nextAction,
    q.urgent ? 'Reminder: nothing has promised the customer an emergency visit.' : null,
    leadUrl ? 'Open: ' + leadUrl : null,
  ];
  return lines.filter(Boolean).join('\n');
}
