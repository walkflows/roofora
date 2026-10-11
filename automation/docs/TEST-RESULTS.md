# ROOFORA — test results (11 Oct 2026)

> **Real (live) results are in `LIVE-TEST-REPORT.md`.** This file covers the offline/simulated checks (now 155: 78 logic, 63 simulated journeys, 7 setup, 7 import script). The statement below that nothing ran against real services is **out of date** for everything listed in the live report; reply detection passed live both via the on-demand check and the Gmail polling trigger.

**Read this first.** Nothing below has run against your real Airtable base, Gmail, Google Calendar, Telegram or n8n server — I had no access to them (see `CHECKLIST.md › Blockers`). Everything marked *simulated* ran the real generated workflow JSON through an interpreter against fake services I wrote. That proves the wiring and decision logic. It does **not** prove the live services behave the same.

Run everything yourself: `npm run automation:test` (needs no accounts).

## 1. Verified for real (no external accounts involved)

| What | How | Result |
|---|---|---|
| Website form logic & UI | Real browser (Playwright) against `npm run dev`, with the n8n side **simulated** by `automation/tests/mock-n8n.mjs` | ✅ see list below |
| TypeScript | `npx tsc --noEmit` | ✅ no errors |
| Lint | `npm run lint` | ✅ 0 errors |
| Production build | `npx next build --webpack` | ✅ compiles; routes `/api/enquiry`, `/api/enquiry/photo`, `/api/quote`, `/quote/[token]` present |
| Pure decision logic (validation, time zones/DST, service area, qualification, email safety switches, reply classification, follow-up stop rules, booking checks, quote rules, problem reports) | `automation/tests/logic.test.mjs` | ✅ 74 / 74 |
| All Code-node scripts compile | build step + `new Function` check | ✅ 90 nodes |
| Build-time guard: every Code node includes the helper libraries it calls | `build.mjs` | ✅ (it caught one real bug, below) |

**Browser checks that passed (mock n8n):** empty submit sends nothing and focuses the first error · Email preference makes the email required, Phone makes it optional · urgent notice and photo safety wording shown exactly · permission box starts unchecked and is required · 3-photo limit, previews, remove, wrong type / over 5 MB / unreadable file rejected with clear messages · enquiry saved → success only after confirmation, reference shown · photo upload progress; a failed photo shows its error and a working **Retry** without touching the saved enquiry · server error and dropped connection keep every field and the consent tick · same Submission ID on every retry (3 attempts → 1 lead) · double click sends one request · no horizontal overflow at 390 px and 320 px · quote page view → confirm → accept → "already answered" states · bad quote token handled · inactive/unreachable n8n shows "couldn't confirm — safe to resend", never success, never a misleading validation message.

## 2. Simulated end-to-end journeys — 53 / 53 pass

`automation/tests/journey.test.mjs` — real workflow JSON, fake Airtable (enforces `schema.json`: unknown fields are rejected), fake Gmail, Calendar, Telegram.

* **Enquiries:** email preference (saved, acknowledged, alerted) · phone preference with an email given (callback task, **no** email) · urgent (priority, owner, callback, no emergency promise) · out-of-area/uncertain (flagged, never rejected) · invalid payloads rejected · retry returns the same lead · two simultaneous-duplicate orderings · Airtable down / Leads write failing / Telegram down / Gmail failing · customer emails switched off · Test Mode redirect.
* **Photos:** upload, retry without duplicating, invalid requests, mismatching ID, upload failure then successful retry.
* **Inspections:** book (GET changes nothing), book twice, calendar clash, outside hours / past / unlinked, calendar down then retry, event created but Airtable failed then repaired without a second event, reschedule (same event, stale reminder dropped), reminders 24 h/2 h once each, cancelled booking drops its reminder, phone customers get tasks, cancel and re-book, complete, cross-site POST refused.
* **Quotes:** unapproved/incomplete refused, approved sent once with expiring link (only a hash stored), new version supersedes old, accept → Won + job task + no date promised, double accept idempotent, decline, expired/unknown link, staff-recorded phone answers.
* **Replies:** thread / reference / address matching, ambiguity not guessed, auto-reply logged but follow-ups continue, bounce pauses, `STOP` withdraws permission.
* **Follow-ups:** not before due, once when due, repeated triggers send nothing extra, final closing check creates a staff task, reply/booking/Won/Lost/withdrawn/pause each stop them, phone customers get call tasks, quote follow-ups days 2/5/10, empty sweep costs 2 Airtable calls.
* **Uncertain Gmail results:** timed out *after* sending → found in Sent, not resent · timed out *before* sending → resent exactly once · Sent unsearchable → not resent, flagged **Needs My Help**.
* **Error handler:** plain-English alert, no personal data, identical alerts muted, no recursion when Airtable and Telegram are both down.

## 3. Simulated Airtable setup — 6 / 6 pass
Check-only changes nothing · create builds every table/field/link/dropdown from `schema.json` and seeds Settings · a second run changes nothing · a base built this way runs a full journey with **no** unknown-field or bad-option warnings · missing `schema.bases:read` / `:write` scope gives exact advice · a partly built base: only additions, existing tables/fields/primary columns/other tables untouched, differences reported.

## 4. Import script — 7 / 7 against a *fake* n8n API
Dry run writes nothing · apply creates 4 inactive workflows linked by the real IDs and leaves other projects untouched · re-run updates instead of duplicating and skips an active workflow · wrong key writes nothing · an existing workflow is backed up before it is replaced · duplicate names are refused · credential discovery is read-only and returns ids/names only.

## 5. Real bugs the tests found and I fixed (so you know the tests are earning their keep)
1. The reminder loop would have re-run forever after the 2 h reminder.
2. `Booking Result` called a helper it did not include → would have crashed on the **failure** path in n8n.
3. After the last follow-up a lead sat "Active" with nothing scheduled and no staff task → added a closing check.
4. A no-op daily sweep and no-op email records made a pointless Airtable request each (Free-plan waste).
5. "Supersede older quotes" depended on the Leads *primary column* being named `Enquiry Ref` → removed the dependency.
6. The setup report did not add the `Enquiry Ref` column when an existing table's first column had another name.
7. Weekend → next-opening time skipped a whole business day; UK postcode `SE1` wrongly failed to match.
8. The website treated n8n's own 404 (inactive workflow) as a validation problem.
9. Gmail trigger would have ignored customer replies already opened by staff (now reads read + unread).
10. A text file renamed `.jpg` was accepted at pick time (now checked before upload).

## 6. NOT verified — needs your accounts
* Importing and running the workflows on your **real self-hosted n8n** (n8n item/expression semantics, `$('node')` behaviour in loops, the Code-node sandbox, Wait-node persistence across restarts, static-data persistence used for alert muting).
* The existing **Airtable credential's real scopes**, the real base's structure, the 5 MB upload endpoint, real rate limits.
* Real **Gmail** sending/threading/Sent search/inbox trigger output shape (I used n8n's documented `simple:false` format), the *Send mail as* sender, and Google OAuth.
* Real **Google Calendar** event IDs/conflicts/time zones.
* Real **Telegram** delivery.
* The deployed website on Vercel (not deployed, by your instruction), including real request-size behaviour (photos are capped at 3.5 MB per request, under Vercel's 4.5 MB limit) and BotID/Firewall rules.
* Airtable usage counts (budget numbers are from the simulation).

## 7. Known issue in the existing site
`npm run build` (Turbopack) fails with *"Can't resolve '@vercel/turbopack-next/internal/font/google/font'"* from the existing `next/font/google` loader in `app/layout.tsx`; `next build --webpack` succeeds. I did not touch that font code. I tried to confirm whether the original commit has the same problem but could not complete that check, so I can't say it predates my changes. Vercel's own build will show whether it matters; `npm run dev` (webpack mode) worked for all browser tests.
