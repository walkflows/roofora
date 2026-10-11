// TEMPORARY test harness for controlled live tests. NOT part of the product.
//
// n8n's public API cannot run a workflow, and Airtable/Gmail/Calendar/Telegram are reachable only through the
// n8n credentials. This builds one small webhook workflow, "ROOFORA — Test Harness (TEMPORARY)", that lets the
// local test driver make a strictly limited set of calls with those credentials:
//   Airtable : only base <airtableBaseId>; GET / POST / PATCH on records, GET on schema (+ read-only whoami). Never DELETE, never schema writes.
//   Gmail    : GET only (profile, sendAs list, message search/read). It cannot send mail.
//   Calendar : GET calendar list / events; create ONE test calendar named "ROOFORA Inspections (TEST)"; events ONLY on the
//              configured test calendar. Never the primary calendar.
//   Telegram : one short message per call, only if it starts with "ROOFORA — TEST", only to the configured chat.
// Protected by the ROOFORA Website Webhook header secret. Install → use → remove (see live-tests).

export function harnessCode(cfg) {
  return `
const body = $input.first().json.body || {};
const BASE = ${JSON.stringify(cfg.airtableBaseId)};
const CAL = ${JSON.stringify(cfg.testCalendarId || '')};
const method = String(body.method || 'GET').toUpperCase();
const url = String(body.url || '');
const deny = (why) => [{ json: { route: 3, out: { statusCode: 403, body: { harness: 'refused', why } } } }];
if (body.service === 'telegram') {
  const text = String(body.text || (body.body && body.body.text) || '');
  if (!text.startsWith('ROOFORA — TEST') || text.length > 900) return deny('only short messages starting with ROOFORA — TEST are allowed');
  return [{ json: { route: 4, text } }];
}
if (!['GET', 'POST', 'PATCH'].includes(method)) return deny('method not allowed');
if (/\\.\\.|%2e%2e/i.test(url)) return deny('path tricks not allowed');
if (body.service === 'airtable') {
  if (method === 'GET' && url === 'https://api.airtable.com/v0/meta/whoami') return [{ json: { route: 0, method, url } }];
  const re = new RegExp('^https://(api|content)\\\\.airtable\\\\.com/v0/(meta/bases/)?' + BASE + '/');
  if (!re.test(url)) return deny('only the ROOFORA base is allowed');
  if (/\\/meta\\//.test(url) && method !== 'GET') return deny('schema is read-only here');
  return [{ json: { route: method === 'GET' ? 0 : 5, method, url, body: body.body } }];
}
if (body.service === 'gmail') {
  if (method !== 'GET' || !/^https:\\/\\/gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/(profile|settings\\/sendAs|messages|threads)/.test(url)) return deny('Gmail is read-only here');
  return [{ json: { route: 1, method, url } }];
}
if (body.service === 'calendar') {
  const okList = method === 'GET' && /^https:\\/\\/www\\.googleapis\\.com\\/calendar\\/v3\\/users\\/me\\/calendarList(\\?|$)/.test(url);
  const okCreate = method === 'POST' && url === 'https://www.googleapis.com/calendar/v3/calendars' && body.body && body.body.summary === 'ROOFORA Inspections (TEST)';
  const onTest = CAL && url.startsWith('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(CAL));
  if (!(okList || okCreate || onTest)) return deny('calendar call not allowed');
  return [{ json: { route: method === 'GET' ? 2 : 6, method, url, body: body.body } }];
}
return deny('unknown service');
`;
}

export function buildHarness(cfg) {
  const cred = (key, type) => ({ [type]: { id: cfg.credentials[key].id, name: cfg.credentials[key].name } });
  const airtableType = cfg.credentials.airtable.type || 'airtableTokenApi';
  const readNode = (name, key, type, pos) => ({
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
    parameters: { method: 'GET', url: '={{ $json.url }}', authentication: 'predefinedCredentialType', nodeCredentialType: type, options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
    credentials: cred(key, type),
  });
  const writeNode = (name, key, type, pos) => ({
    name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
    parameters: { method: '={{ $json.method }}', url: '={{ $json.url }}', authentication: 'predefinedCredentialType', nodeCredentialType: type, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.body) }}', options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 30000 } },
    credentials: cred(key, type),
  });
  const nodes = [
    { name: 'Harness Call', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'roofora-harness-post', parameters: { httpMethod: 'POST', path: 'roofora/harness', authentication: 'headerAuth', responseMode: 'responseNode', options: {} }, credentials: cred('websiteWebhook', 'httpHeaderAuth') },
    { name: 'Check Request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [260, 0], parameters: { jsCode: harnessCode(cfg) } },
    { name: 'Which Service', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [520, 0], parameters: { mode: 'expression', numberOutputs: 7, output: '={{ $json.route }}' } },
    readNode('Airtable Read', 'airtable', airtableType, [780, -320]),
    readNode('Gmail Read', 'gmail', 'gmailOAuth2', [780, -160]),
    readNode('Calendar Read', 'googleCalendar', 'googleCalendarOAuth2Api', [780, 0]),
    { name: 'Refused', type: 'n8n-nodes-base.code', typeVersion: 2, position: [780, 160], parameters: { jsCode: 'return [{ json: $input.first().json.out }];' } },
    { name: 'Send Test Alert', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [780, 320], onError: 'continueRegularOutput', parameters: { chatId: cfg.telegramChatId, text: '={{ $json.text }}', additionalFields: { appendAttribution: false } }, credentials: cred('telegram', 'telegramApi') },
    writeNode('Airtable Write', 'airtable', airtableType, [780, 480]),
    writeNode('Calendar Write', 'googleCalendar', 'googleCalendarOAuth2Api', [780, 640]),
    { name: 'Alert Result', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1040, 320], parameters: { jsCode: 'const j = $input.first().json; return [{ json: { statusCode: j.error ? 500 : 200, body: j.error ? undefined : { message_id: j.result ? j.result.message_id : j.message_id, sent: true }, error: j.error ? String(j.error.message || j.error).slice(0, 200) : undefined } }];' } },
    { name: 'Reply', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1300, 0], parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ statusCode: $json.statusCode, body: $json.body, error: $json.error }) }}', options: { responseCode: 200 } } },
  ];
  const to = (...names) => ({ main: [names.map((n) => ({ node: n, type: 'main', index: 0 }))] });
  const connections = {
    'Harness Call': to('Check Request'),
    'Check Request': to('Which Service'),
    // outputs: 0 airtable read, 1 gmail, 2 calendar read, 3 refused, 4 telegram, 5 airtable write, 6 calendar write
    'Which Service': { main: [['Airtable Read'], ['Gmail Read'], ['Calendar Read'], ['Refused'], ['Send Test Alert'], ['Airtable Write'], ['Calendar Write']].map((l) => l.map((n) => ({ node: n, type: 'main', index: 0 }))) },
    'Airtable Read': to('Reply'), 'Gmail Read': to('Reply'), 'Calendar Read': to('Reply'), Refused: to('Reply'),
    'Airtable Write': to('Reply'), 'Calendar Write': to('Reply'),
    'Send Test Alert': to('Alert Result'), 'Alert Result': to('Reply'),
  };
  return { name: 'ROOFORA — Test Harness (TEMPORARY)', nodes, connections, settings: { executionOrder: 'v1', timezone: cfg.workflowTimezone } };
}
