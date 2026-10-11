// Creates the two ROOFORA-only webhook credentials on the n8n instance (idempotent, never prints secrets).
//
//   node automation/scripts/create-webhook-credentials.mjs
//
// 1. "ROOFORA Website Webhook" — Header Auth, header X-Roofora-Secret, value = N8N_ROOFORA_WEBHOOK_SECRET from .env.local.
//    Purpose: proves a request really came from the ROOFORA website server (enquiry, photo, quote webhooks).
// 2. "ROOFORA Staff Access" — Basic Auth. Purpose: protects the staff pages opened by Airtable buttons.
//    The user name/password are generated into .env.local (ROOFORA_STAFF_USER / ROOFORA_STAFF_PASSWORD) if missing.
//
// It only ADDS credentials. It skips a credential whose ID is already in roofora.config.local.json.
// Other credentials and workflows are never read or changed.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, '..', '.env.local');
const CFG = join(ROOT, 'config', 'roofora.config.local.json');

function readEnv() {
  const out = {};
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = readEnv();
for (const k of ['N8N_API_URL', 'N8N_API_KEY', 'N8N_ROOFORA_WEBHOOK_SECRET']) {
  if (!env[k]) { console.error(k + ' is missing in .env.local'); process.exit(2); }
}
const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const isSet = (c) => c && c.id && !/REPLACE/.test(c.id);

if (!env.ROOFORA_STAFF_USER || !env.ROOFORA_STAFF_PASSWORD) {
  const add = (env.ROOFORA_STAFF_USER ? '' : '\nROOFORA_STAFF_USER=roofora-staff') + (env.ROOFORA_STAFF_PASSWORD ? '' : '\nROOFORA_STAFF_PASSWORD=' + randomBytes(18).toString('base64url'));
  appendFileSync(ENV, add + '\n');
  Object.assign(env, readEnv());
}

async function createCredential(body) {
  const res = await fetch(env.N8N_API_URL.replace(/\/+$/, '') + '/api/v1/credentials', {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error('POST /credentials → HTTP ' + res.status + (data && data.message ? ': ' + data.message : ''));
  return data;
}

const plan = [
  { key: 'websiteWebhook', body: { name: 'ROOFORA Website Webhook', type: 'httpHeaderAuth', data: { name: 'X-Roofora-Secret', value: env.N8N_ROOFORA_WEBHOOK_SECRET } } },
  { key: 'staffAccess', body: { name: 'ROOFORA Staff Access', type: 'httpBasicAuth', data: { user: env.ROOFORA_STAFF_USER, password: env.ROOFORA_STAFF_PASSWORD } } },
];
for (const p of plan) {
  if (isSet(cfg.credentials[p.key])) { console.log(p.body.name + ': already in config (' + cfg.credentials[p.key].id + ') — skipped'); continue; }
  const made = await createCredential(p.body);
  cfg.credentials[p.key] = { id: made.id, name: p.body.name };
  writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n'); // save after each, so a later failure never loses an id
  console.log('created "' + p.body.name + '" id=' + made.id + ' (' + p.body.type + ')');
}
