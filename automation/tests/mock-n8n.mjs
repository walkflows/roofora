// SIMULATED n8n webhooks for testing the ROOFORA website locally.
//   node automation/tests/mock-n8n.mjs        (listens on http://localhost:5799)
//
// This is NOT n8n and NOT Airtable. It only answers like the real workflow's
// documented contract so the website's behaviour can be tested in a browser.
// Special test names (fullName):
//   "Fail Save"  → answers 500 (server error)
//   "Slow Save"  → never answers (tests the website's timeout / uncertain path)
//   "Twice Save" → saves, then drops the connection once without answering (client retries → duplicate answer)
// Photos: slot 2 fails the first time, succeeds on retry.

import { createServer } from 'node:http';

const SECRET = process.env.MOCK_SECRET || 'mock-secret';
const leads = new Map(); // submissionId → { id, ref }
const photos = new Set();
const dropped = new Set();
const log = [];
let counter = 0;

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  if (req.url === '/_log') return send(res, 200, { leads: [...leads.entries()], photos: [...photos], log });
  // MOCK_INACTIVE=1 imitates n8n when the workflow is not active: n8n's own 404 body, no `ok` field.
  if (process.env.MOCK_INACTIVE) { for await (const _ of req) { /* drain */ } return send(res, 404, { code: 404, message: 'The requested webhook "POST roofora/enquiry" is not registered.' }); }
  if (req.headers['x-roofora-secret'] !== SECRET) return send(res, 403, { ok: false, error: 'forbidden' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const route = req.url.split('/').pop();
  log.push(route + ' ' + (body.enquiryRef || body.action || ''));

  if (route === 'enquiry') {
    if (body.fullName === 'Fail Save') return send(res, 500, { ok: false });
    if (body.fullName === 'Slow Save') return; // hang
    const existing = leads.get(body.submissionId);
    if (existing) return send(res, 200, { ok: true, status: 'duplicate', enquiryRef: existing.ref, leadRecordId: existing.id, acceptsPhotos: true });
    const lead = { id: 'rec' + String(++counter).padStart(14, '0'), ref: body.enquiryRef };
    leads.set(body.submissionId, lead);
    if (body.fullName === 'Twice Save' && !dropped.has(body.submissionId)) {
      dropped.add(body.submissionId);
      return req.socket.destroy();
    }
    return send(res, 200, { ok: true, status: 'created', enquiryRef: lead.ref, leadRecordId: lead.id, acceptsPhotos: true });
  }
  if (route === 'photo') {
    const key = body.leadRecordId + ':' + body.slot;
    if (body.slot === 2 && !body.retry && !photos.has('failed-once:' + key)) {
      photos.add('failed-once:' + key);
      return send(res, 502, { ok: false });
    }
    photos.add(key);
    return send(res, 200, { ok: true, status: 'uploaded', bytes: body.size });
  }
  if (route === 'quote') {
    const quote = { enquiryRef: 'RF-3F2B8C1E', firstName: 'Test', version: 2, amount: 1840, currency: 'GBP', scope: 'Strip and re-lay the rear slope.\nNew battens and felt.', validUntil: '2026-11-11T00:00:00Z', status: 'Sent' };
    if (body.action === 'view') return send(res, 200, { ok: true, quote });
    return send(res, 200, { ok: true, result: body.action === 'accept' ? 'accepted' : 'declined', quote: { ...quote, status: body.action === 'accept' ? 'Accepted' : 'Declined' } });
  }
  send(res, 404, { ok: false });
}).listen(5799, () => console.log('SIMULATED n8n (mock) on http://localhost:5799'));
