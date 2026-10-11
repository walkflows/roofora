// Helpers for the controlled live journey tests. Fictional leads only. Every customer email goes to the test
// recipient only (Test Mode + allowlist enforced in the workflow). Nothing here prints secrets.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { n8n, harness, webhook, loadCfg, atList, atPatch, sleep, evidence, REPO, env } from './live-lib.mjs';

export const cfg = loadCfg();
export const SITE = 'http://localhost:3000';
export const TEST_TO = cfg.settingsSeed['Test Recipient Email'];
export const SENDER = cfg.settingsSeed['Sender Email'];
// plain "contains" matchers (usable like a RegExp: TEST_RE.test(text)), so no regex escaping is needed
export const TEST_RE = { test: (v) => String(v || '').toLowerCase().includes(TEST_TO.toLowerCase()) };
export const SENDER_RE = { test: (v) => String(v || '').toLowerCase().includes(SENDER.toLowerCase()) };

const STATE = join(REPO, 'automation', '.scratch', 'live-state.json');
export const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {});
export const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

export const ok = (name, cond, detail = '') => { evidence(`- ${cond ? 'PASS' : 'FAIL'} (REAL) ${name}${detail ? ' — ' + detail : ''}`); return Boolean(cond); };

// ---------- synthetic PNG ----------
function crc(buf) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of buf) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; }
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
export function png(w, h, seed) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (seed + x / 4) % 256; raw[o + 1] = (seed * 2 + y / 4) % 256; raw[o + 2] = 90; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- the website (real Next.js routes on this PC → real n8n → real Airtable) ----------
export function enquiryBody(over = {}) {
  return {
    accessCode: env.ROOFORA_DEMO_ACCESS_CODE || undefined, submissionId: randomUUID(), fullName: 'Test Customer (fictional)', phone: '+447700900123', email: TEST_TO,
    propertyType: 'Residential', service: 'Roof Repair', town: 'Croydon', postcode: 'CR0 1AA', details: 'FICTIONAL TEST: two slates slipped.',
    urgency: 'This week', preferredContact: 'Email', consent: true, photoCount: 0, website: '', startedAt: Date.now() - 10000, ...over,
  };
}
export async function site(body) {
  const r = await fetch(SITE + '/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
export async function sitePhoto(token, slot, bytes, retry = false) {
  const fd = new FormData();
  fd.set('token', token); fd.set('slot', String(slot)); fd.set('retry', retry ? '1' : '0');
  fd.set('file', new Blob([bytes], { type: 'image/png' }), `photo-${slot}.png`);
  const r = await fetch(SITE + '/api/enquiry/photo', { method: 'POST', body: fd });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
export const refOf = (submissionId) => 'RF-' + submissionId.replace(/-/g, '').slice(0, 8).toUpperCase();

// ---------- Airtable (real, via the temporary harness) ----------
export async function leadByRef(ref) {
  const r = await atList(cfg, 'Leads', 'filterByFormula=' + encodeURIComponent(`{Enquiry Ref}='${ref}'`));
  return r;
}
export const rec = async (table, id) => (await harness('airtable', 'GET', `https://api.airtable.com/v0/${cfg.airtableBaseId}/${encodeURIComponent(table)}/${id}`)).body;
export async function activityFor(leadId) {
  const all = await atList(cfg, 'Activity', 'pageSize=100');
  return all.filter((a) => (a.fields.Lead || []).includes(leadId));
}

// ---------- Gmail Sent (real) ----------
export async function sentMail(q) {
  const list = await harness('gmail', 'GET', 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=' + encodeURIComponent('in:sent ' + q));
  const out = [];
  for (const m of (list.body && list.body.messages) || []) {
    const d = await harness('gmail', 'GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=From`);
    const h = Object.fromEntries(((d.body && d.body.payload && d.body.payload.headers) || []).map((x) => [x.name.toLowerCase(), x.value]));
    out.push({ id: m.id, threadId: m.threadId, to: h.to, from: h.from, subject: h.subject });
  }
  return out;
}
export async function sentBody(id) {
  const d = await harness('gmail', 'GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const parts = [d.body.payload].concat((d.body.payload && d.body.payload.parts) || []);
  const p = parts.find((x) => x && x.body && x.body.data);
  return p ? Buffer.from(p.body.data, 'base64url').toString('utf8') : '';
}

// ---------- n8n execution evidence ----------
export async function executionsSince(workflowId, sinceIso) {
  const r = await n8n('GET', `/executions?workflowId=${workflowId}&limit=50`);
  return (r.data || []).filter((e) => Date.parse(e.startedAt) >= Date.parse(sinceIso)).map((e) => ({ id: e.id, status: e.status }));
}
export async function telegramFrom(execId) {
  try {
    const e = await n8n('GET', `/executions/${execId}?includeData=true`);
    const run = e.data && e.data.resultData && e.data.resultData.runData;
    const out = [];
    for (const [node, runs] of Object.entries(run || {})) {
      if (!/^Telegram/.test(node)) continue;
      for (const r of runs) for (const item of (r.data && r.data.main && r.data.main[0]) || []) if (item.json && (item.json.result || item.json.message_id)) out.push({ node, message_id: (item.json.result && item.json.result.message_id) || item.json.message_id });
    }
    return out;
  } catch { return []; }
}

import { atCreate } from './live-lib.mjs';
export { sleep, evidence, n8n, harness, webhook, atList, atPatch, atCreate };
