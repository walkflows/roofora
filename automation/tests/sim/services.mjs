// SIMULATED Airtable, Gmail, Google Calendar and Telegram for workflow tests.
// None of this is real. The Airtable fake enforces automation/airtable/schema.json:
// an unknown field name is rejected exactly like Airtable's 422 UNKNOWN_FIELD_NAME,
// so a field-name typo in the workflows fails the test instead of passing silently.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFormula, evalFormula } from './formula.mjs';

const schema = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'airtable', 'schema.json'), 'utf8'));
export class NetworkError extends Error {}

const resp = (statusCode, body) => ({ statusCode, headers: {}, body });
const rand = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

export function createServices(clock, baseId = 'appTESTBASE0000001', opts = {}) {
  // Structure lives in `meta` (what Airtable's schema API shows). `initial`: 'full' (every designed table), 'empty', or an array of ready-made meta tables.
  const meta = { tables: [] };
  const tables = new Map();
  const fieldDefs = new Map();
  const gmail = { sent: [], inbox: [], mode: 'ok', calls: 0 }; // mode: ok | fail400 | timeout-sent | timeout-unsent | http503
  const calendar = { events: new Map(), mode: 'ok' };
  const telegram = { messages: [], mode: 'ok' };
  const airtable = { mode: 'ok', failTable: null, failMethod: null, calls: [], scopes: { read: true, write: true }, schemaWrites: [] };
  const warnings = [];
  let seq = 0;

  const newId = () => 'rec' + (String(++seq).padStart(4, '0') + rand(10)).slice(0, 14);
  const newMetaId = (prefix) => prefix + rand(14);

  const toDef = (f, isPrimary) => ({
    name: f.name, type: f.type, primary: isPrimary,
    options: f.options && f.options.choices ? f.options.choices.map((c) => c.name) : undefined,
    linkedTable: f.options && f.options.linkedTableId ? (meta.tables.find((t) => t.id === f.options.linkedTableId) || {}).name : undefined,
  });
  function registerTable(t) {
    meta.tables.push(t);
    tables.set(t.name, new Map());
    fieldDefs.set(t.name, new Map(t.fields.map((f) => [f.name, toDef(f, f.id === t.primaryFieldId)])));
  }
  function refreshDefs(t) {
    fieldDefs.set(t.name, new Map(t.fields.map((f) => [f.name, toDef(f, f.id === t.primaryFieldId)])));
  }
  function metaFromDesign() {
    const made = schema.tables.map((t) => ({ id: newMetaId('tbl'), name: t.name, fields: t.fields.map((f) => ({ id: newMetaId('fld'), name: f.name, type: f.type, primary: f.primary, def: f })) }));
    const idByName = Object.fromEntries(made.map((t) => [t.name, t.id]));
    return made.map((t) => ({
      id: t.id, name: t.name, primaryFieldId: t.fields.find((f) => f.primary).id,
      fields: t.fields.map((f) => ({ id: f.id, name: f.name, type: f.type, options: designOptions(f.def, idByName) })),
    }));
  }
  function designOptions(d, idByName) {
    if (d.type === 'singleSelect' || d.type === 'multipleSelects') return { choices: d.options.map((name) => ({ name })) };
    if (d.type === 'multipleRecordLinks') return { linkedTableId: idByName[d.linkedTable] };
    if (d.type === 'number') return { precision: d.precision || 0 };
    return undefined;
  }
  const initial = opts.initial || 'full';
  if (initial === 'full') { const made = metaFromDesign(); for (const t of made) registerTable(t); for (const t of made) refreshDefs(t); }
  else if (Array.isArray(initial)) { for (const t of initial) registerTable(t); for (const t of meta.tables) refreshDefs(t); }

  const PRIMARY_TYPES = ['singleLineText', 'multilineText', 'email', 'url', 'number', 'phoneNumber'];
  function validateFieldBody(f, tableNames) {
    const o = f.options;
    if (!f.name || typeof f.name !== 'string') return 'name is required';
    if (!f.type) return 'type is required';
    const sel = () => Boolean(o && Array.isArray(o.choices) && o.choices.length && o.choices.every((c) => c.name));
    const need = {
      number: () => Boolean(o && Number.isInteger(o.precision) && o.precision >= 0 && o.precision <= 8) || 'number needs options.precision 0-8',
      checkbox: () => Boolean(o && o.icon && o.color) || 'checkbox needs options.icon and options.color',
      dateTime: () => Boolean(o && o.timeZone && o.dateFormat && ['local', 'friendly', 'us', 'european', 'iso'].includes(o.dateFormat.name) && o.timeFormat && ['12hour', '24hour'].includes(o.timeFormat.name)) || 'dateTime needs timeZone, dateFormat.name and timeFormat.name',
      singleSelect: () => sel() || 'singleSelect needs options.choices with names',
      multipleSelects: () => sel() || 'multipleSelects needs options.choices with names',
      multipleRecordLinks: () => Boolean(o && o.linkedTableId && meta.tables.some((t) => t.id === o.linkedTableId)) || 'multipleRecordLinks needs a valid options.linkedTableId',
    };
    const known = ['singleLineText', 'multilineText', 'email', 'phoneNumber', 'url', 'multipleAttachments', ...Object.keys(need)];
    if (!known.includes(f.type)) return 'unsupported field type ' + f.type;
    if (need[f.type]) { const r = need[f.type](); if (r !== true) return r; }
    return null;
  }

  function metaHandle(method, url, body) {
    const parts = url.pathname.replace(/^\/v0\/meta\/bases\//, '').split('/');
    if (parts[0] !== baseId) return resp(404, { error: { type: 'NOT_FOUND' } });
    const isWrite = method !== 'GET';
    if (!airtable.scopes[isWrite ? 'write' : 'read']) return resp(403, { error: { type: 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND', message: 'Invalid permissions, or the requested model was not found.' } });
    if (parts[1] === 'tables' && !parts[2] && method === 'GET') {
      return resp(200, { tables: JSON.parse(JSON.stringify(meta.tables.map((t) => ({ ...t, views: [] })))) });
    }
    if (parts[1] === 'tables' && !parts[2] && method === 'POST') {
      if (!body.name || !Array.isArray(body.fields) || !body.fields.length) return resp(422, { error: { type: 'INVALID_REQUEST_BODY', message: 'name and at least one field are required' } });
      if (meta.tables.some((t) => t.name.toLowerCase() === body.name.toLowerCase())) return resp(422, { error: { type: 'DUPLICATE_TABLE_NAME' } });
      if (!PRIMARY_TYPES.includes(body.fields[0].type)) return resp(422, { error: { type: 'INVALID_REQUEST_BODY', message: 'first field must be a primary field type' } });
      const seen = new Set();
      for (const f of body.fields) {
        const bad = validateFieldBody(f);
        if (bad) return resp(422, { error: { type: 'INVALID_REQUEST_BODY', message: f.name + ': ' + bad } });
        if (f.type === 'multipleRecordLinks' && false) return resp(422, {});
        if (seen.has(f.name.toLowerCase())) return resp(422, { error: { type: 'DUPLICATE_FIELD_NAME', message: f.name } });
        seen.add(f.name.toLowerCase());
      }
      const t = { id: newMetaId('tbl'), name: body.name, fields: body.fields.map((f) => ({ id: newMetaId('fld'), name: f.name, type: f.type, options: f.options })) };
      t.primaryFieldId = t.fields[0].id;
      registerTable(t);
      airtable.schemaWrites.push('create table ' + t.name);
      return resp(200, JSON.parse(JSON.stringify({ ...t, views: [] })));
    }
    if (parts[1] === 'tables' && parts[2] && parts[3] === 'fields' && method === 'POST') {
      const t = meta.tables.find((x) => x.id === parts[2]);
      if (!t) return resp(404, { error: { type: 'TABLE_NOT_FOUND' } });
      const bad = validateFieldBody(body);
      if (bad) return resp(422, { error: { type: 'INVALID_REQUEST_BODY', message: body.name + ': ' + bad } });
      if (t.fields.some((f) => f.name.toLowerCase() === body.name.toLowerCase())) return resp(422, { error: { type: 'DUPLICATE_FIELD_NAME', message: body.name } });
      const f = { id: newMetaId('fld'), name: body.name, type: body.type, options: body.options };
      t.fields.push(f);
      refreshDefs(t);
      airtable.schemaWrites.push('add field ' + t.name + '.' + f.name);
      return resp(200, f);
    }
    return resp(404, { error: { type: 'NOT_FOUND' } });
  }

  function checkFields(table, fields, creating) {
    const defs = fieldDefs.get(table);
    if (!defs) return { error: { type: 'TABLE_NOT_FOUND', message: 'Table ' + table + ' not found' } };
    for (const [name, value] of Object.entries(fields)) {
      const d = defs.get(name);
      if (!d) return { error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "' + name + '" in ' + table } };
      if (value === null || value === undefined) continue;
      if (d.type === 'singleSelect' && !d.options.includes(value)) warnings.push(table + '.' + name + ': option "' + value + '" is not in schema.json (typecast would create it)');
      if (d.type === 'multipleSelects' && !(Array.isArray(value) && value.every((v) => d.options.includes(v)))) warnings.push(table + '.' + name + ': bad options');
      if (d.type === 'number' && typeof value !== 'number') return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' must be a number' } };
      if (d.type === 'checkbox' && typeof value !== 'boolean') return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' must be boolean' } };
      if (d.type === 'dateTime' && isNaN(Date.parse(value))) return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' invalid date ' + value } };
      if (d.type === 'multipleRecordLinks') {
        if (!Array.isArray(value)) return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' must be an array' } };
        const target = tables.get(d.linkedTable);
        if (!value.every((id) => target.has(id))) return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' links to an unknown record' } };
      }
      if (d.type === 'multipleAttachments') return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'Attachments must be uploaded, not written' } };
      if (d.type === 'singleLineText' && typeof value !== 'string') return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' must be text' } };
      if (d.type === 'multilineText' && typeof value !== 'string') return { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: table + '.' + name + ' must be text' } };
    }
    return null;
  }

  const linkNamesFor = (table, record) => (field) => {
    const def = fieldDefs.get(table).get(field);
    const ids = record.fields[field] || [];
    if (!def || def.type !== 'multipleRecordLinks') return String(ids);
    const target = tables.get(def.linkedTable);
    const linked = meta.tables.find((t) => t.name === def.linkedTable);
    const primary = linked.fields.find((f) => f.id === linked.primaryFieldId).name;
    return ids.map((id) => (target.get(id) ? target.get(id).fields[primary] : id));
  };

  function airtableHandle(method, url, body) {
    airtable.calls.push(method + ' ' + url.pathname + url.search.slice(0, 60));
    if (url.pathname.startsWith('/v0/meta/')) { if (airtable.mode === 'down') throw new NetworkError('ECONNRESET'); return metaHandle(method, url, body); }
    const parts = url.pathname.replace(/^\/v0\//, '').split('/').map(decodeURIComponent);
    if (parts[0] !== baseId) return resp(404, { error: { type: 'NOT_FOUND', message: 'Base not found' } });
    const [, table, recordId, field, action] = parts;
    if (airtable.mode === 'down') throw new NetworkError('ECONNRESET');
    if (airtable.mode === '503' || (airtable.failTable === table && (!airtable.failMethod || airtable.failMethod === method))) return resp(503, { error: { type: 'SERVICE_UNAVAILABLE' } });
    if (url.hostname === 'content.airtable.com') {
      const rec = tables.get(table) && tables.get(table).get(recordId);
      // here parts = [base, recordId, field, 'uploadAttachment'] because the table is implied by the record
      const [, rid, fname] = parts;
      for (const [tn, rows] of tables) if (rows.has(rid)) {
        const row = rows.get(rid);
        if (!fieldDefs.get(tn).get(fname) || fieldDefs.get(tn).get(fname).type !== 'multipleAttachments') return resp(422, { error: { type: 'UNKNOWN_FIELD_NAME' } });
        const bytes = Buffer.from(body.file || '', 'base64').length;
        if (bytes > 5 * 1024 * 1024) return resp(413, { error: { type: 'REQUEST_TOO_LARGE' } });
        row.fields[fname] = [...(row.fields[fname] || []), { id: 'att' + rand(10), filename: body.filename, size: bytes, type: body.contentType, url: 'https://v5.airtableusercontent.com/expiring/' + rand(12) }];
        return resp(200, { id: rid, createdTime: row.createdTime, fields: { [fname]: row.fields[fname] } });
      }
      return resp(404, { error: { type: 'NOT_FOUND' } });
    }
    const rows = tables.get(table);
    if (!rows) return resp(404, { error: { type: 'TABLE_NOT_FOUND', message: table } });
    if (method === 'GET' && recordId) {
      const row = rows.get(recordId);
      return row ? resp(200, row) : resp(404, { error: { type: 'NOT_FOUND' } });
    }
    if (method === 'GET') {
      let list = [...rows.values()];
      const formula = url.searchParams.get('filterByFormula');
      if (formula) {
        const ast = parseFormula(formula);
        list = list.filter((r) => evalFormula(ast, { record: r, linkNames: linkNamesFor(table, r), now: clock.ms }));
      }
      const max = Number(url.searchParams.get('maxRecords') || url.searchParams.get('pageSize') || 100);
      list = list.slice(0, max);
      const fields = url.searchParams.getAll('fields[]');
      if (fields.length) list = list.map((r) => ({ ...r, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => fields.includes(k))) }));
      return resp(200, { records: JSON.parse(JSON.stringify(list)) });
    }
    if (method === 'POST' || method === 'PATCH') {
      const records = body && body.records;
      if (!Array.isArray(records) || records.length === 0 || records.length > 10) return resp(422, { error: { type: 'INVALID_REQUEST_BODY', message: 'records must hold 1–10 items' } });
      const out = [];
      for (const r of records) {
        const bad = checkFields(table, r.fields || {}, method === 'POST');
        if (bad) return resp(422, bad);
        if (method === 'POST') {
          const row = { id: newId(), createdTime: clock.iso(), fields: {} };
          for (const [k, v] of Object.entries(r.fields || {})) if (v !== null && v !== undefined) row.fields[k] = v;
          rows.set(row.id, row);
          out.push(row);
        } else {
          const row = rows.get(r.id);
          if (!row) return resp(404, { error: { type: 'NOT_FOUND', message: 'Record ' + r.id } });
          for (const [k, v] of Object.entries(r.fields || {})) { if (v === null) delete row.fields[k]; else if (v !== undefined) row.fields[k] = v; }
          out.push(row);
        }
      }
      return resp(200, { records: JSON.parse(JSON.stringify(out)) });
    }
    return resp(405, { error: { type: 'METHOD_NOT_ALLOWED' } });
  }

  function gmailHandle(method, url, body) {
    if (method === 'POST' && url.pathname.endsWith('/messages/send')) {
      gmail.calls++;
      if (gmail.mode === 'fail400') return resp(400, { error: { message: 'Invalid To header' } });
      if (gmail.mode === 'http503') return resp(503, { error: { message: 'backend error' } });
      const raw = Buffer.from(body.raw, 'base64url').toString('utf8');
      const [head, b64] = raw.split('\r\n\r\n');
      const msg = {
        id: 'gm' + rand(8), threadId: body.threadId || 'th' + rand(8), at: clock.iso(),
        from: /^From: (.+)$/m.exec(head)[1], to: /^To: (.+)$/m.exec(head)[1], subject: /^Subject: (.+)$/m.exec(head)[1].replace(/^=\?UTF-8\?B\?(.+)\?=$/, (_, x) => Buffer.from(x, 'base64').toString('utf8')),
        text: Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8'),
      };
      if (gmail.mode === 'timeout-unsent') { gmail.mode = 'ok'; throw new NetworkError('ETIMEDOUT'); }
      gmail.sent.push(msg);
      if (gmail.mode === 'timeout-sent') { gmail.mode = 'ok'; throw new NetworkError('ETIMEDOUT'); }
      return resp(200, { id: msg.id, threadId: msg.threadId });
    }
    const one = /\/messages\/([^/?]+)$/.exec(url.pathname);
    if (method === 'GET' && one) {
      const m = gmail.inbox.find((x) => x.id === one[1]);
      if (!m) return resp(404, { error: {} });
      return resp(200, { id: m.id, threadId: m.threadId, internalDate: String(m.internalDate), snippet: m.text.slice(0, 100), payload: { mimeType: 'text/plain', headers: m.headers, body: { data: Buffer.from(m.text, 'utf8').toString('base64url') } } });
    }
    if (method === 'GET' && url.pathname.endsWith('/messages') && (url.searchParams.get('q') || '').includes('in:inbox')) {
      return resp(200, { messages: gmail.inbox.map((m) => ({ id: m.id, threadId: m.threadId })) });
    }
    if (method === 'GET' && url.pathname.endsWith('/messages')) {
      if (gmail.mode === 'search-fail') return resp(500, { error: {} });
      const q = url.searchParams.get('q') || '';
      const key = /"([^"]+)"/.exec(q);
      const hits = gmail.sent.filter((m) => key && m.text.includes(key[1]));
      return resp(200, hits.length ? { messages: hits.map((m) => ({ id: m.id, threadId: m.threadId })) } : { resultSizeEstimate: 0 });
    }
    return resp(404, { error: {} });
  }

  function calendarHandle(method, url, body) {
    if (calendar.mode === 'down') throw new NetworkError('ECONNRESET');
    if (calendar.mode === '500') return resp(500, { error: { message: 'Internal' } });
    const m = /\/calendars\/([^/]+)\/events(?:\/([^/?]+))?/.exec(url.pathname);
    if (!m) return resp(404, { error: {} });
    const id = m[2];
    if (method === 'GET' && !id) {
      const min = Date.parse(url.searchParams.get('timeMin')), max = Date.parse(url.searchParams.get('timeMax'));
      const items = [...calendar.events.values()].filter((e) => e.status !== 'cancelled' && Date.parse(e.start.dateTime) < max && Date.parse(e.end.dateTime) > min);
      return resp(200, { items });
    }
    if (method === 'POST') {
      if (!/^[a-v0-9]{5,1024}$/.test(body.id)) return resp(400, { error: { message: 'Invalid resource id value.' } });
      if (calendar.events.has(body.id)) return resp(409, { error: { message: 'The requested identifier already exists.' } });
      calendar.events.set(body.id, { ...body, status: body.status || 'confirmed' });
      return resp(200, calendar.events.get(body.id));
    }
    if (method === 'PATCH') {
      const ev = calendar.events.get(id);
      if (!ev) return resp(404, { error: { message: 'Not Found' } });
      Object.assign(ev, body);
      return resp(200, ev);
    }
    return resp(405, { error: {} });
  }

  async function http({ method, url: rawUrl, body, credentialsKinds }) {
    const url = new URL(rawUrl);
    const need = url.hostname.includes('airtable') ? 'airtableTokenApi' : url.hostname === 'gmail.googleapis.com' ? 'gmailOAuth2' : url.hostname === 'www.googleapis.com' ? 'googleCalendarOAuth2Api' : null;
    if (!need) throw new Error('Unexpected host in a workflow request: ' + url.hostname);
    if (!credentialsKinds.includes(need)) throw new Error('HTTP node is missing the ' + need + ' credential for ' + url.hostname);
    if (url.hostname.includes('airtable')) return airtableHandle(method, url, body);
    if (url.hostname === 'gmail.googleapis.com') return gmailHandle(method, url, body);
    return calendarHandle(method, url, body);
  }

  return {
    http, tables, gmail, calendar, telegram, airtable, warnings,
    // test helpers
    seed(table, fields) {
      const bad = checkFields(table, fields, true);
      if (bad) throw new Error(JSON.stringify(bad));
      const row = { id: newId(), createdTime: clock.iso(), fields: { ...fields } };
      tables.get(table).set(row.id, row);
      return row;
    },
    rows: (table) => [...tables.get(table).values()],
    row: (table, id) => tables.get(table).get(id),
    byField: (table, field, value) => [...tables.get(table).values()].filter((r) => r.fields[field] === value),
    activities: (leadId, type) => [...tables.get('Activity').values()].filter((r) => (r.fields.Lead || []).includes(leadId) && (!type || r.fields.Type === type)),
  };
}
