// Tiny evaluator for the Airtable formulas the ROOFORA workflows use.
// Supports: AND OR FIND LOWER ARRAYJOIN RECORD_ID IS_BEFORE DATEADD, {Field},
// quoted strings (with \' and \\ escapes), numbers, = and !=.
// Anything else throws, so an unsupported formula is noticed rather than guessed.

function tokenize(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '{') { const j = src.indexOf('}', i); t.push({ k: 'field', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, v = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { v += src[j + 1]; j += 2; } else v += src[j++]; }
      t.push({ k: 'str', v }); i = j + 1; continue;
    }
    if (c === '-' && /[0-9]/.test(src[i + 1] || '')) { let j = i + 1; while (/[0-9.]/.test(src[j] || '')) j++; t.push({ k: 'num', v: Number(src.slice(i, j)) }); i = j; continue; }
    if (/[0-9]/.test(c)) { let j = i; while (/[0-9.]/.test(src[j] || '')) j++; t.push({ k: 'num', v: Number(src.slice(i, j)) }); i = j; continue; }
    if (src.startsWith('!=', i)) { t.push({ k: 'op', v: '!=' }); i += 2; continue; }
    if (c === '=') { t.push({ k: 'op', v: '=' }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { t.push({ k: c }); i++; continue; }
    if (/[A-Z_]/i.test(c)) { let j = i; while (/[A-Z_0-9]/i.test(src[j] || '')) j++; t.push({ k: 'fn', v: src.slice(i, j).toUpperCase() }); i = j; continue; }
    throw new Error('Formula: unexpected character ' + c + ' in ' + src);
  }
  return t;
}

export function parseFormula(src) {
  const t = tokenize(src);
  let p = 0;
  function expr() {
    let left = primary();
    if (t[p] && t[p].k === 'op') { const op = t[p++].v; const right = primary(); return { op, left, right }; }
    return left;
  }
  function primary() {
    const tok = t[p++];
    if (!tok) throw new Error('Formula ended early: ' + src);
    if (tok.k === 'field') return { field: tok.v };
    if (tok.k === 'str' || tok.k === 'num') return { lit: tok.v };
    if (tok.k === 'fn') {
      if (t[p] && t[p].k === '(') {
        p++;
        const args = [];
        if (t[p].k !== ')') { args.push(expr()); while (t[p].k === ',') { p++; args.push(expr()); } }
        if (t[p++].k !== ')') throw new Error('Formula: missing ) in ' + src);
        return { fn: tok.v, args };
      }
    }
    throw new Error('Formula: unexpected token ' + JSON.stringify(tok) + ' in ' + src);
  }
  const ast = expr();
  if (p !== t.length) throw new Error('Formula: trailing tokens in ' + src);
  return ast;
}

/** ctx: { record, linkName(table,id) → primary value, linkTable(fieldName) } */
export function evalFormula(node, ctx) {
  const e = (n) => evalFormula(n, ctx);
  if ('lit' in node) return node.lit;
  if ('field' in node) { const v = ctx.record.fields[node.field]; return v === undefined ? '' : v; }
  if (node.op) {
    const a = e(node.left), b = e(node.right);
    const eq = String(a ?? '') === String(b ?? '');
    return node.op === '=' ? eq : !eq;
  }
  const args = node.args.map((a) => (node.fn === 'ARRAYJOIN' && 'field' in a ? ctx.linkNames(a.field) : e(a)));
  switch (node.fn) {
    case 'AND': return args.every(Boolean);
    case 'OR': return args.some(Boolean);
    case 'FIND': { const i = String(args[1] ?? '').indexOf(String(args[0] ?? '')); return i < 0 ? 0 : i + 1; }
    case 'LOWER': return String(args[0] ?? '').toLowerCase();
    case 'ARRAYJOIN': return Array.isArray(args[0]) ? args[0].join(', ') : String(args[0] ?? '');
    case 'RECORD_ID': return ctx.record.id;
    case 'FALSE': return false;
    case 'NOW': return new Date(ctx.now || Date.now()).toISOString();
    case 'IS_AFTER': return args[0] !== '' && args[0] !== undefined && Date.parse(args[0]) > Date.parse(args[1]);
    case 'IS_BEFORE': return args[0] !== '' && args[0] !== undefined && Date.parse(args[0]) < Date.parse(args[1]);
    case 'DATEADD': {
      if (args[2] !== 'hours') throw new Error('Formula: DATEADD only supports hours here');
      return new Date(Date.parse(args[0]) + Number(args[1]) * 3600e3).toISOString();
    }
    default: throw new Error('Formula: unsupported function ' + node.fn);
  }
}
