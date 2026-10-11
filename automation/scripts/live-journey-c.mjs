// Live journey C: quotes (approval guard, secure link, accept/decline/supersede, idempotency).
import { webhook } from './live-lib.mjs';
import { cfg, SITE, rec, activityFor, sentMail, sentBody, atList, ok, loadState, saveState, sleep, evidence, atPatch, atCreate } from './live-journey-lib.mjs';

const state = loadState(); const L = state.leads;
evidence(`\n## Journey C — quotes (started ${new Date().toISOString()})`);
const base = 'https://n8n.walkflow.tech';
const press = (action, record) => webhook('roofora/staff', { action, record }, { method: 'POST', basic: true, headers: { Origin: base } });
const text = (r) => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
const newQuote = async (lead, v, extra = {}) => (await atCreate(cfg, 'Quotes', { Quote: 'FICTIONAL TEST quote', Lead: [lead], Version: v, Scope: 'FICTIONAL TEST SCOPE: replace twelve slipped slates, re-bed the ridge tiles and clear the rear gutter.', Amount: 640 + v * 80, Status: 'Draft', ...extra })).body.records[0].id;
const quoteApi = async (action, token) => { const r = await fetch(SITE + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token }) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
const tokenFromEmail = async (ref, n = 0) => {
  const mails = (await sentMail(`${ref} "roofing quote"`)).filter((m) => /Your roofing quote from/.test(m.subject));
  const body = await sentBody(mails[n].id);
  const m = /http:\/\/localhost:3000\/quote\/([a-f0-9]{64})/.exec(body);
  return { token: m && m[1], count: mails.length, mails };
};

// ---- C1: an unapproved quote is never sent
const q0 = await newQuote(L.a1.id, 1, { Approved: false });
const mailsBefore = (await sentMail(L.a1.ref)).length;
const r0 = await press('send-quote', q0); await sleep(3000);
ok('C1 unapproved quote refused ("Tick Approved…"), stays Draft, no email', r0.status === 409 && /Tick Approved/.test(text(r0)) && (await rec('Quotes', q0)).fields.Status === 'Draft' && (await sentMail(L.a1.ref)).length === mailsBefore, `HTTP ${r0.status}`);

// ---- C2: approved quote is sent once with a secure link
await atPatch(cfg, 'Quotes', q0, { Approved: true, 'Approved By': 'Test Approver (fictional)' });
const r1 = await press('send-quote', q0); await sleep(9000);
const qf = (await rec('Quotes', q0)).fields; const lf = (await rec('Leads', L.a1.id)).fields;
const em = await tokenFromEmail(L.a1.ref);
ok('C2 approved quote emailed ONCE to the test inbox with a 64-hex secure link (localhost URL)', r1.status === 200 && em.count === 1 && TEST_RE.test(em.mails[0].to) && Boolean(em.token), `HTTP ${r1.status}; quote emails=${em.count}`);
ok('C2 Airtable: quote Sent (+Sent At, expiry), only the token HASH stored; lead Quote Sent with quote follow-ups scheduled', qf.Status === 'Sent' && Boolean(qf['Sent At']) && Boolean(qf['Link Expires At']) && qf['Link Token Hash'] && qf['Link Token Hash'] !== em.token && lf.Stage === 'Quote Sent' && lf['Follow-up Kind'] === 'Quote' && Boolean(lf['Next Follow-up At']), `Stage=${lf.Stage} nextFollowUp=${lf['Next Follow-up At']}`);
const again = await press('send-quote', q0); await sleep(4000);
ok('C2 pressing Send again: "already sent", no second email', /already sent/.test(text(again)) && (await tokenFromEmail(L.a1.ref)).count === 1);

// ---- C3: the customer link via the real website route
const page = await fetch(`${SITE}/quote/${em.token}`);
const html = await page.text();
ok('C3 website quote page shows the quote (price/scope) without changing anything', page.status === 200 && /FICTIONAL TEST SCOPE/.test(html) && /720/.test(html) && (await rec('Quotes', q0)).fields.Status === 'Sent', `HTTP ${page.status}`);
const bad = await quoteApi('accept', 'f'.repeat(64));
ok('C3 an unknown/forged link cannot accept anything', bad.status !== 200 && (await rec('Quotes', q0)).fields.Status === 'Sent', `HTTP ${bad.status}`);
const acc = await quoteApi('accept', em.token); await sleep(9000);
const lf2 = (await rec('Leads', L.a1.id)).fields; const qf2 = (await rec('Quotes', q0)).fields;
const acts = await activityFor(L.a1.id);
ok('C3 accept via secure link: quote Accepted, lead WON, follow-ups completed, "Schedule job" task (no date promised)', acc.status === 200 && acc.data.result === 'accepted' && qf2.Status === 'Accepted' && qf2['Customer Response'] === 'Accepted online' && lf2.Stage === 'Won' && lf2['Follow-up Status'] === 'Completed' && /not yet promised/.test(lf2['Next Action'] || '') && acts.some((a) => /Schedule job/.test(a.fields.Activity) && /agree a job date/.test(a.fields.Details || '')), `Stage=${lf2.Stage} followUps=${lf2['Follow-up Status']}`);
ok('C3 confirmation email "quote is accepted" to the test inbox only', (await sentMail(`${L.a1.ref} "quote is accepted"`)).length === 1);
const acc2 = await quoteApi('accept', em.token); const dec2 = await quoteApi('decline', em.token); await sleep(3000);
ok('C3 accepting twice is idempotent; declining after acceptance is refused; still exactly one job task', acc2.status === 200 && dec2.status === 409 && (await rec('Leads', L.a1.id)).fields.Stage === 'Won' && (await activityFor(L.a1.id)).filter((a) => /Schedule job/.test(a.fields.Activity)).length === 1, `again=${acc2.status}/${acc2.data.result} decline=${dec2.status}`);

// ---- C4: new version supersedes the old; decline path
const qa = await newQuote(L.a2.id, 1, { Approved: true, 'Approved By': 'Test Approver (fictional)' });
await press('send-quote', qa); await sleep(9000);
const old = await tokenFromEmail(L.a2.ref);
const qb = await newQuote(L.a2.id, 2, { Approved: true, 'Approved By': 'Test Approver (fictional)', Amount: 700 });
await press('send-quote', qb); await sleep(9000);
const mails2 = (await sentMail(`${L.a2.ref} "roofing quote"`)).filter((m) => /Your roofing quote from/.test(m.subject));
ok('C4 version 2 sent; version 1 marked Superseded', (await rec('Quotes', qa)).fields.Status === 'Superseded' && (await rec('Quotes', qb)).fields.Status === 'Sent' && mails2.length === 2, `emails=${mails2.length}`);
const oldTry = await quoteApi('accept', old.token);
ok('C4 the OLD quote link can no longer be accepted', oldTry.status === 409 && (await rec('Leads', L.a2.id)).fields.Stage !== 'Won', `HTTP ${oldTry.status} ${oldTry.data.result || ''}`);
const newTok = await tokenFromEmail(L.a2.ref, 0);
const decl = await quoteApi('decline', (newTok.token === old.token ? (await tokenFromEmail(L.a2.ref, 1)).token : newTok.token)); await sleep(8000);
ok('C4 decline via the current link: quote Declined, lead Lost, follow-ups stopped', decl.status === 200 && (await rec('Quotes', qb)).fields.Status === 'Declined' && (await rec('Leads', L.a2.id)).fields.Stage === 'Lost' && (await rec('Leads', L.a2.id)).fields['Follow-up Status'] === 'Stopped', `HTTP ${decl.status} ${decl.data.result || ''}`);
state.quotes = { q0, qa, qb }; saveState(state);
