// Imports the ROOFORA workflows into your self-hosted n8n through its public API.
//
//   node automation/scripts/deploy-n8n.mjs            dry run: shows what it WOULD create/update
//   node automation/scripts/deploy-n8n.mjs --apply    creates/updates the four ROOFORA workflows (inactive); backs up any it replaces
//   node automation/scripts/deploy-n8n.mjs --discover  READ-ONLY: lists credential IDs already used on the instance
//
// Needs (in ROOFERA/.env.local, never committed):  N8N_API_URL=https://your-n8n-host   N8N_API_KEY=...
// and automation/config/roofora.config.local.json (copy of the .example file with your real IDs).
//
// Safety: it only touches workflows whose name starts with "ROOFORA — ", never activates anything,
// never touches credentials, and never deletes. The n8n API key is read from the environment and not printed.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, toJson, checkWiring } from '../build/build.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..');
const PREFIX = 'ROOFORA — ';
const ORDER = ['errorHandler', 'sendEmail', 'leadManager', 'airtableSetup']; // callees before callers

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function listWorkflows(api) {
  const out = [];
  let cursor = '';
  do {
    const page = await api('GET', '/workflows?limit=250' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(page.data || []));
    cursor = page.nextCursor || '';
  } while (cursor);
  return out;
}

/**
 * READ-ONLY. Lists the credential IDs/names that existing workflows on the instance already use, by type,
 * so you can copy the right IDs into roofora.config.local.json. Prints no secrets (n8n never returns them).
 */
export async function discoverCredentials({ apiUrl, apiKey, fetchImpl = fetch }) {
  const api = async (_method, path) => {
    const res = await fetchImpl(apiUrl.replace(/\/+$/, '') + '/api/v1' + path, { headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' } });
    if (!res.ok) throw new Error('GET ' + path + ' → HTTP ' + res.status);
    return res.json();
  };
  const wanted = ['airtableTokenApi', 'gmailOAuth2', 'googleCalendarOAuth2Api', 'telegramApi', 'httpHeaderAuth', 'httpBasicAuth'];
  const found = new Map();
  for (const w of await listWorkflows(api)) {
    if (w.isArchived) continue;
    const full = w.nodes ? w : await api('GET', '/workflows/' + w.id);
    for (const n of full.nodes || []) {
      for (const [type, ref] of Object.entries(n.credentials || {})) {
        if (!wanted.includes(type) || !ref || !ref.id) continue;
        found.set(type + '|' + ref.id, { type, id: ref.id, name: ref.name, usedBy: new Set([...(found.get(type + '|' + ref.id)?.usedBy || []), w.name]) });
      }
    }
  }
  return [...found.values()].map((c) => ({ ...c, usedBy: [...c.usedBy].slice(0, 3) })).sort((a, b) => a.type.localeCompare(b.type));
}

export async function deploy({ apply, apiUrl, apiKey, cfg, log = console.log, fetchImpl = fetch, backup = null }) {
  const api = async (method, path, body) => {
    const res = await fetchImpl(apiUrl.replace(/\/+$/, '') + '/api/v1' + path, {
      method,
      headers: { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* leave null */ }
    if (!res.ok) throw new Error(method + ' ' + path + ' → HTTP ' + res.status + (data && data.message ? ': ' + data.message : ''));
    return data;
  };

  // find existing ROOFORA workflows (exact names only); refuse to guess if a name appears twice
  const existing = new Map();
  const duplicates = [];
  for (const w of await listWorkflows(api)) {
    if (!w.name.startsWith(PREFIX)) continue;
    if (existing.has(w.name)) duplicates.push(w.name + ' (ids ' + existing.get(w.name).id + ', ' + w.id + ')');
    else existing.set(w.name, w);
  }
  if (duplicates.length) throw new Error('More than one workflow has the same ROOFORA name, so nothing was changed. Remove or rename the extra copy in n8n first: ' + duplicates.join('; '));

  const ids = { ...cfg.workflowIds };
  const report = [];
  for (const key of ORDER) {
    const built = buildAll({ ...cfg, workflowIds: ids })[key];
    checkWiring(built);
    const body = toJson(built);
    if (!body.name.startsWith(PREFIX)) throw new Error('Refusing to touch a workflow not named ' + PREFIX + '…: ' + body.name);
    const found = existing.get(body.name);
    if (found && found.active) {
      log('! ' + body.name + ' is ACTIVE in n8n; leaving it alone (deactivate it first if you want it replaced).');
      ids[key] = found.id;
      report.push({ key, action: 'skipped (active)', id: found.id });
      continue;
    }
    if (!apply) {
      log('would ' + (found ? 'UPDATE ' : 'CREATE ') + body.name + ' (' + body.nodes.length + ' nodes)');
      ids[key] = found ? found.id : ids[key];
      report.push({ key, action: found ? 'would update' : 'would create', id: found && found.id });
      continue;
    }
    if (found && backup) backup(body.name, found.id, await api('GET', '/workflows/' + found.id)); // keep the previous version before replacing it
    const saved = found ? await api('PUT', '/workflows/' + found.id, body) : await api('POST', '/workflows', body);
    ids[key] = saved.id;
    log((found ? 'updated ' : 'created ') + body.name + '  id=' + saved.id + '  (inactive)');
    report.push({ key, action: found ? 'updated' : 'created', id: saved.id });
  }
  return { ids, report };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = { ...loadEnvFile(join(REPO, '.env.local')), ...process.env };
  const localCfg = join(ROOT, 'config', 'roofora.config.local.json');
  const problems = [];
  if (!env.N8N_API_URL) problems.push('N8N_API_URL is not set in ROOFERA/.env.local');
  if (!env.N8N_API_KEY) problems.push('N8N_API_KEY is not set in ROOFERA/.env.local (n8n › Settings › n8n API › Create an API key)');
  if (!existsSync(localCfg)) problems.push('automation/config/roofora.config.local.json is missing (copy roofora.config.example.json and fill in your IDs)');
  if (problems.length) { console.error('Cannot continue:\n - ' + problems.join('\n - ')); process.exit(2); }
  const cfg = JSON.parse(readFileSync(localCfg, 'utf8'));
  if (process.argv.includes('--discover')) {
    const list = await discoverCredentials({ apiUrl: env.N8N_API_URL, apiKey: env.N8N_API_KEY });
    console.log('Credentials already used by workflows on ' + env.N8N_API_URL + ' (read-only; IDs and names only):\n');
    for (const c of list) console.log(c.type.padEnd(26) + c.id.padEnd(20) + '"' + c.name + '"   e.g. used by: ' + c.usedBy.join(', '));
    console.log('\nCopy the ones ROOFORA should use into automation/config/roofora.config.local.json › credentials. Create any that are missing in n8n first.');
    process.exit(0);
  }
  const apply = process.argv.includes('--apply');
  // Never import with placeholder IDs: the workflows would be created with broken credential references.
  const placeholders = [];
  const scan = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'workflowIds' || k.startsWith('_')) continue;
      if (v && typeof v === 'object') scan(v, path + k + '.');
      else if (typeof v === 'string' && /REPLACE/.test(v) && k !== 'name') placeholders.push(path + k);
    }
  };
  scan(cfg, '');
  if (placeholders.length && apply) {
    console.error('Refusing to import: roofora.config.local.json still has placeholders for: ' + placeholders.join(', ') + '\nFill them in (see docs/SETUP.md), or run without --apply for a dry run.');
    process.exit(2);
  }
  if (placeholders.length) console.log('Note: placeholders still to fill before --apply: ' + placeholders.join(', ') + '\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = (name, id, json) => {
    const dir = join(ROOT, 'backups', stamp);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name.replace(/[^A-Za-z0-9]+/g, '-') + '.' + id + '.json'), JSON.stringify(json, null, 2));
    console.log('backed up previous "' + name + '" → automation/backups/' + stamp + '/');
  };
  if (!apply) console.log('DRY RUN — nothing will be written. Add --apply to create/update the workflows.\n');
  const { ids } = await deploy({ apply, apiUrl: env.N8N_API_URL, apiKey: env.N8N_API_KEY, cfg, backup });
  if (apply) {
    console.log('\nPut these IDs in roofora.config.local.json › workflowIds so future runs update the same workflows:');
    console.log(JSON.stringify({ sendEmail: ids.sendEmail, errorHandler: ids.errorHandler }, null, 2));
    console.log('\nNext: open each workflow in n8n, check every credential is selected, then run "ROOFORA — Airtable Setup Check" (Check Only first).');
  }
}
