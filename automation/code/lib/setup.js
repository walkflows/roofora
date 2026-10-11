// ROOFORA automation — one-time Airtable base check / setup.
// Depends on core.js. Only ever ADDS missing tables and fields. It never
// renames, retypes, reorders or deletes anything that already exists.

/** Airtable "create field" body for one schema field (null for link fields until the table ids are known). */
function fieldBody(def, tableIdByName) {
  const body = { name: def.name, type: def.type };
  if (def.note) body.description = String(def.note).slice(0, 500);
  switch (def.type) {
    case 'number': body.options = { precision: def.precision === undefined ? 0 : def.precision }; break;
    case 'checkbox': body.options = { icon: 'check', color: 'greenBright' }; break;
    case 'dateTime': body.options = { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' }; break;
    case 'singleSelect':
    case 'multipleSelects': body.options = { choices: def.options.map((name) => ({ name })) }; break;
    case 'multipleRecordLinks':
      if (!tableIdByName || !tableIdByName[def.linkedTable]) return null;
      body.options = { linkedTableId: tableIdByName[def.linkedTable] };
      break;
    default: break;
  }
  return body;
}

function indexStructure(res) {
  const tables = res && res.body && Array.isArray(res.body.tables) ? res.body.tables : [];
  const byName = {};
  const idByName = {};
  for (const t of tables) { byName[t.name] = t; idByName[t.name] = t.id; }
  return { tables, byName, idByName };
}

/** Explains a failed structure read in plain English, including the exact scope that is missing. */
function accessProblem(res, baseId) {
  const code = res && res.statusCode;
  if (ok(res)) return null;
  if (code === 401) return 'Airtable rejected the token (401). In n8n, open the Airtable credential and check the token is valid.';
  if (code === 403) return 'The token cannot read this base\'s structure (403). Add the scope schema.bases:read AND give the token access to base ' + baseId + ' (Airtable › Developer hub › your token). Without it only record reads/writes work.';
  if (code === 404) return 'Airtable says base ' + baseId + ' was not found (404). Check the base ID, and that the token has access to that base.';
  return 'Could not read the base structure (' + httpProblem(res) + ').';
}

/**
 * Pass 1: create missing tables (without link fields) and missing plain fields in existing tables.
 * Returns { ops, warnings } where ops are HTTP requests for the n8n Airtable credential.
 */
function planSchemaPass(structure, schema, baseId, includeLinks) {
  const ops = [];
  const warnings = [];
  const meta = 'https://api.airtable.com/v0/meta/bases/' + baseId + '/tables';
  for (const t of schema.tables) {
    const existing = structure.byName[t.name];
    const want = t.fields.filter((f) => includeLinks ? f.type === 'multipleRecordLinks' : f.type !== 'multipleRecordLinks');
    if (!existing) {
      if (includeLinks) continue; // table creation happens in pass 1
      const fields = want.map((f) => fieldBody(f, null)).filter(Boolean);
      // the primary field must come first
      fields.sort((a, b) => (a.name === t.fields.find((f) => f.primary).name ? -1 : b.name === t.fields.find((f) => f.primary).name ? 1 : 0));
      ops.push({ label: 'create table ' + t.name, method: 'POST', url: meta, body: { name: t.name, description: t.description, fields } });
      continue;
    }
    const have = new Map((existing.fields || []).map((f) => [String(f.name).toLowerCase(), f]));
    const primary = t.fields.find((f) => f.primary);
    const actualPrimary = (existing.fields || []).find((f) => f.id === existing.primaryFieldId);
    if (!includeLinks && actualPrimary && primary && actualPrimary.name !== primary.name) {
      warnings.push('Table "' + t.name + '": the first (primary) column is called "' + actualPrimary.name + '", the design expects "' + primary.name + '". Airtable cannot change this by API; rename the column by hand (nothing was changed).');
    }
    for (const f of want) {
      const found = have.get(f.name.toLowerCase());
      if (found) {
        if (found.type !== f.type) warnings.push('Table "' + t.name + '", field "' + f.name + '" is type ' + found.type + ' but the design expects ' + f.type + '. Not changed; fix by hand or the workflows may fail.');
        else if ((f.type === 'singleSelect' || f.type === 'multipleSelects') && found.options && Array.isArray(found.options.choices)) {
          const names = found.options.choices.map((c) => c.name);
          const missing = f.options.filter((o) => !names.includes(o));
          if (missing.length) warnings.push('Table "' + t.name + '", field "' + f.name + '" is missing option(s): ' + missing.join(', ') + '. Add them by hand (Airtable\'s API cannot add options to an existing dropdown).');
        }
        continue;
      }
      const body = fieldBody(f, structure.idByName);
      if (!body) continue; // link target table does not exist yet
      ops.push({ label: 'add field ' + t.name + '.' + f.name, method: 'POST', url: meta + '/' + existing.id + '/fields', body });
    }
  }
  return { ops, warnings };
}

/** Link fields can only be created after every table exists. */
function planLinkPass(structure, schema, baseId) {
  return planSchemaPass(structure, schema, baseId, true);
}

/** Final comparison of the real base to the design. */
function compareStructure(structure, schema) {
  const missingTables = [];
  const missingFields = [];
  const mismatches = [];
  const extras = [];
  for (const t of schema.tables) {
    const existing = structure.byName[t.name];
    if (!existing) { missingTables.push(t.name); continue; }
    const have = new Map((existing.fields || []).map((f) => [String(f.name).toLowerCase(), f]));
    for (const f of t.fields) {
      const found = have.get(f.name.toLowerCase());
      if (!found) missingFields.push(t.name + '.' + f.name);
      else if (found.type !== f.type) mismatches.push(t.name + '.' + f.name + ' is ' + found.type + ', expected ' + f.type);
    }
  }
  const designed = new Set(schema.tables.map((t) => t.name));
  for (const t of structure.tables) if (!designed.has(t.name)) extras.push(t.name);
  return { missingTables, missingFields, mismatches, extras };
}

/** Settings seed: only when the Settings table exists and has no rows. */
function planSettingsSeed(settingsRes, schema, baseId) {
  if (!ok(settingsRes)) return { seed: false, why: 'Settings table could not be read (' + httpProblem(settingsRes) + ')' };
  if ((settingsRes.body.records || []).length) return { seed: false, why: 'Settings row already exists (left untouched)' };
  return { seed: true, url: 'https://api.airtable.com/v0/' + baseId + '/Settings', body: { typecast: true, records: [{ fields: schema.settingsDefaults }] } };
}
