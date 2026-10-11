# ROOFORA lead-to-job automation — requirement checklist

_Last updated 11 Oct 2026. Nothing is deployed and no live customer messaging is switched on._

**Status key**
* ✅ **Verified** — built and checked for real (browser, build, type/lint) with no external account needed.
* 🧪 **Simulated** — built and passes tests that run the real workflow JSON against fake Airtable/Gmail/Calendar/Telegram/n8n. Wiring and logic proven; **live behaviour unproven**.
* ⏳ **Waiting** — built, but needs your credentials/configuration before it can run for real.
* ❌ **Not done**

Details of every test: `docs/TEST-RESULTS.md`.

## Blockers (what I need from you)
1. **n8n API key** for **https://n8n.walkflow.tech** (confirmed as the ROOFORA instance; healthy, public API enabled, ROOFORA webhooks not yet registered). `.env.local` is prepared — add `N8N_API_KEY` (n8n › Settings › n8n API). The n8n connector in my Claude session still reaches a *different* n8n (n8n Cloud, the WALKFLOW workspace) with **no Airtable credential**, so I cannot see your credential or import anything until the key is in place.
2. The **ROOFORA Airtable base ID** and the Airtable credential's **n8n ID**; confirmation that the token has `data.records:read/write` (+ `schema.bases:read/write` if the Setup Check should create tables) on that one base. *"A successful connection test"* does not prove these.
3. The two webhook credentials, plus ROOFORA Gmail / Calendar / Telegram credentials (`docs/SETUP.md` steps 2–3).
4. The business's **time zone, hours, service area, sender address, phone** (Airtable › Settings).
5. `workflow-automation-library-libraries` **does not exist** on this computer. The nearest is `Downloads/walkflow-automation-library` (project docs and exports, no skill files). I read its reliability notes and WALKFLOW BUSINESS / FORMERA workflow docs and followed their patterns (single serialised senders, check-before-resend, safe-by-default switches). I did **not** read any "skills" from a folder of that name and I did not modify that library. If the skills live elsewhere, tell me the path.

## FINAL status — 11 Oct 2026 (supersedes the earlier update below)
Full detail: `docs/LIVE-TEST-REPORT.md`; step-by-step ids: `docs/LIVE-TEST-EVIDENCE.md`.
* ✅ **Verified live** (real n8n + Airtable + Gmail + Calendar + Telegram, fictional leads, test inbox only): setup of the real base; enquiries with/without photos; attachments; phone/urgent/duplicate/concurrent handling; address redirect; inspections incl. reschedule/cancel/clash; 24 h + 2 h reminders; approved quotes, secure link, accept/decline/supersede; follow-ups and their stop rules; allowlist and master email switch; error recording + Telegram alert.
* ✅ **Reply detection verified live (13:04 UTC, 0 emails sent):** the real reply was matched to the right enquiry by Gmail thread, recorded once, follow-ups paused, 20 other leads (incl. one with the same email address) untouched, a due sweep skipped it, re-reading recorded nothing twice. **Caveat:** it ran through the new on-demand "Check Replies Now" path; the Gmail *polling trigger* is still disabled and unverified live.
* ✅ **Gmail polling trigger verified live (14:02 UTC, 0 emails sent):** it fired unattended, matched the replies to the correct enquiry (RF-0A16B2BF) by Gmail thread, paused its follow-ups, recorded each of the 2 distinct replies once, and nothing was re-recorded across re-reads and a further poll cycle; no other lead changed. The test first exposed a real defect (lead lookup capped at 5 rows) which is fixed with a regression test. See `docs/LIVE-TEST-REPORT.md` §3.
* ✅ **Demo-readiness work (11 Oct, later):** `npm run build` fixed (self-hosted font); access-code gate + daily enquiry cap + localhost-quote-link guard; privacy notice page and demo labelling; existing Vercel project `roofora` inspected (preview plan in `docs/DEPLOY-PREVIEW.md`); Hobby-plan firewall facts checked; demo Airtable budget written. Code is on local branch `demo/controlled-preview`, uncommitted; nothing pushed or deployed.
* ⚠️ Offline-only: unclear-Gmail-result recovery, Airtable/Telegram outage handling, n8n restart while a timer waits.
* ❌ Still needed from the business: real privacy policy, business contact details, sender address, hours, service area, time zone confirmation.
* **Agreed development scope: complete** (with the limitations in `docs/LIVE-TEST-REPORT.md` §4). **Not production-ready:** real business details, privacy policy, a company-owned sender and a paid Airtable plan are needed — see `docs/DEMO-VS-REAL-SETTINGS.md`. All four workflows inactive; harness deleted; Customer Emails Enabled OFF; Test Mode ON; deployment paused.

## Status update — earlier on 11 Oct 2026 (live session on n8n.walkflow.tech)
Ids and statuses: `docs/LIVE-TEST-EVIDENCE.md`.
* ✅ **REAL:** authenticated to `n8n.walkflow.tech`; the four ROOFORA workflows imported **inactive** (no duplicates, nothing else touched); two ROOFORA webhook credentials created.
* ✅ **REAL:** the Gmail credential authorises `the connected Gmail sender` (primary) and the WALKFLOW alias `hello@walkflow.tech`; the alias is **not** used. The test recipient is the same address as the sender, so reply-detection testing needs a separate inbox from you.
* ✅ **REAL:** dedicated calendar "ROOFORA Inspections (TEST)" created, time zone Europe/London, id saved to config, read access verified (0 events).
* ✅ **REAL:** one Telegram test alert, labelled "ROOFORA — TEST", delivered to your existing alert chat.
* ❌ **BLOCKED — Airtable:** credential `blm4HV8o…` is the legacy **"Airtable API"** type and Airtable answers **401** (even to read-only `whoami`). Base `the ROOFORA base` has therefore **not** been inspected or changed, and every Airtable-dependent test is still to do. Action: create an *Airtable Personal Access Token* credential (SETUP step 1) and send its ID.

## 0. Ground rules
| Requirement | Status |
|---|---|
| Inspect existing site/n8n first | ✅ site had a 7-field form and a console-only `/api/enquiry`; the reachable n8n had no ROOFORA workflows |
| No Supabase / Twilio / SMS / WhatsApp messaging | ✅ none used; SMS option removed from the form |
| ROOFORA kept separate from WALKFLOW BUSINESS / FORMERA / Lead Scraping | ✅ nothing of theirs read for secrets, changed or run; only read documentation for patterns |
| Automation files in `automation/` | ✅ |
| Deployment and live customer messaging paused | ✅ not deployed; workflows import inactive; Settings default Customer Emails **off**, Test Mode **on** |

## 4. Website form
| Requirement | Status |
|---|---|
| Existing design, colours, typography, services preserved | ✅ |
| Fields: name, phone (international), email (required only for Email), property type, service, location, roof details, urgency, contact method, photos | ✅ browser-tested |
| Urgent notice and photo safety wording (exact) | ✅ |
| Photo previews, removal, clear errors; ≤3 JPG/PNG/WebP, ≤5 MB | ✅ |
| Unchecked required permission checkbox; wording + version + server timestamp recorded; no marketing enrolment | ✅ website side · ⏳ recorded in Airtable when live |
| Link to existing privacy policy | ❌ **none exists** (footer shows plain text "Privacy Policy"). A real page is needed before launch |
| "Send My Enquiry", accessible labels, mobile spacing, client + server validation, honeypot + time check + throttling | ✅ (throttle is per server instance; add a Vercel Firewall rule when deploying) |
| Preserve input on error; prevent double clicks; stable submission ID on retry | ✅ |
| Success only after durable save; visitor does not wait for emails/alerts | ✅ website + 🧪 workflow |

## 5. Airtable & photos
| Requirement | Status |
|---|---|
| Dedicated base; inspect existing tables before changing | ⏳ Setup Check built (🧪 tested); needs your base |
| Small related table set (Leads, Inspections, Quotes, Activity, Settings) | 🧪 `airtable/schema.json`, built and verified by the simulated setup |
| Owner, stage, urgency, next action, last contact; stage separate from urgency; paused / out-of-area / withdrawn permission | 🧪 |
| Stable field names + documented payload contract | ✅ `docs/DATA-CONTRACT.md` |
| Photos as Airtable attachments via the supported upload endpoint; limits checked (Airtable 5 MB direct upload; Vercel 4.5 MB request) | 🧪 built; photos are shrunk to ≤3.5 MB per request |
| Private base, no public photo copies, fresh links (Airtable issues expiring URLs) | 🧪 by design: no URLs stored |
| Partial failure: enquiry kept, photo error shown, safe retry without duplicate lead/photo | ✅ browser + 🧪 |
| Tokens server-side; ignored env files; placeholder-only examples | ✅ `.env.example`, `.gitignore`; secret scan of new files clean |
| Scoped runtime credential, base-restricted | ⏳ you confirm the token scope (SETUP step 1) |
| Existing Airtable credential reused, not duplicated; token not revoked | ✅ no new credential created; nothing revoked |

## 6. Enquiry handling
| Requirement | Status |
|---|---|
| Authenticated webhook + payload validation | 🧪 Header Auth credential (you create it) |
| Submission-ID de-duplication incl. simultaneous requests | 🧪 mechanism + honest residual risk in `docs/WORKFLOWS.md` |
| Service area / service / urgency checks; owner and next action; uncertain location flagged not rejected | 🧪 |
| Email preference → Gmail acknowledgement; Phone preference → callback task + Telegram, never switched to email because an email was given; staff can change preference | 🧪 (change `Preferred Contact` in Airtable) |
| Urgent → priority callback + alert, no emergency promise | 🧪 |
| Dedicated sender identity / isolated config | ⏳ Settings › Sender Email + ROOFORA Gmail credential |

## 7. Inspections
| Requirement | Status |
|---|---|
| Dedicated ROOFORA calendar; timezone/hours/duration/buffer/service area configurable; not assuming Lagos | ⏳ Settings (no default business time zone is assumed) |
| Request, confirm, reschedule, cancel; confirm only after availability check **and** successful save | 🧪 |
| Staff-confirmed scheduling (customer availability → staff proposes slot → system checks, books, confirms) | 🧪 |
| Reminders 24 h + 2 h; respect contact preference; old reminders stop when appointment changes | 🧪 |
| Calendar de-duplication; stale statuses can't double-book | 🧪 |

## 8. Quotes & follow-ups
| Requirement | Status |
|---|---|
| Staff enter/approve scope and price; AI never invents them (no AI used anywhere) | 🧪 |
| Only approved quotes sent; version, amount, sent date, customer response tracked | 🧪 |
| Secure expiring accept/decline link bound to the quote version | 🧪 website ✅ UI |
| Follow-up schedules (enquiry: business days 1 and 3 after the enquiry; quote: days 2, 5 and 10 after sending), configurable in Settings | 🧪 |
| Re-check status before each follow-up; stop on reply/accept/decline/permission withdrawn/cancel/staff takeover | 🧪 |
| Gmail reply matching to lead + thread; replies vs bounces vs auto-replies | 🧪 (real Gmail trigger output unverified) |
| Phone-preference leads get staff tasks not emails | 🧪 |
| Accepted → Won + job-scheduling task; no job date promised; payments out of scope | 🧪 |

## 9. Reliability, errors, cost
| Requirement | Status |
|---|---|
| Dedup for simultaneous submissions and retries | 🧪 |
| Provider IDs + status recorded; never blindly resend or recreate after a timeout | 🧪 |
| Bounded retries; unresolved → "Needs My Help" | 🧪 |
| Error workflow: plain-English record + concise Telegram alert; no alert loops | 🧪 |
| Follow-up/reminder state survives restarts (Airtable timestamps + n8n wait storage) | 🧪 design · ⏳ real n8n restart not tested |
| Airtable Free limits: minimal calls, batching, no empty polling, scheduling frequency explained | 🧪 measured ≈57 calls per journey; **Free plan (1,000/month) ≈ 16 journeys/month** — `docs/AIRTABLE-BUDGET.md` |

## 10. Delivery
| Requirement | Status |
|---|---|
| Synthetic data, test inboxes; no messages to real customers | ✅ |
| Verify full journey + failure cases (list in your brief) | 🧪 53 simulated journeys; ✅ website side in a real browser; ❌ not on live services |
| Documentation: setup, credential locations (no values), field mappings, workflow responsibilities, test results, recovery | ✅ `docs/` |
| Demo recording sequence | ✅ `docs/DEMO-SCRIPT.md` |
| Clear separation of verified / waiting / unfinished | ✅ this file |

## Unfinished / not possible from here
* ❌ Running anything on your **real** n8n, Airtable, Gmail, Calendar or Telegram (blockers above).
* ❌ Privacy-policy page and real business contact details (placeholders remain in `lib/config.ts`).
* ❌ Airtable **button fields** (Airtable's API can't create them — formulas in `samples/airtable-buttons.md`).
* ❌ Deployment (paused by your instruction).
* ⚠️ The Lead Manager export is large (168 nodes, 1.3 MB) because each Code node embeds its helper functions. It works, but if the n8n editor feels heavy, say so and I will slim it.
* ⚠️ `npm run build` (Turbopack) fails on the existing Google-font loader; `next build --webpack` passes. Not confirmed whether it predates my changes.
