# ROOFORA — live test report (11 Oct 2026)

Real services: self-hosted n8n (`n8n.walkflow.tech`), the ROOFORA Airtable base, the shared Gmail credential, a dedicated test Google Calendar and the existing internal Telegram chat. Fictional leads only. Ids and statuses for every step: `LIVE-TEST-EVIDENCE.md`. Offline/simulated results are in `TEST-RESULTS.md` and are **not** counted here. **Reply detection also passed live (section 3).**

## 1. Why the test inbox received so many emails
Counted from n8n's own execution records of the "Send Customer Email" workflow (not from memory):

| | |
|---|---|
| Emails sent | **40**, between 12:14 and 12:49 UTC, **all to the test inbox**, none to any other address |
| Acknowledgements | 14 (one per fictional test lead) |
| Inspection booked / moved | 8 |
| Inspection cancelled | 7 |
| Quote emails | 4 sent + 1 acceptance confirmation |
| Reminders | 4 (two bookings were tested twice) |
| Follow-ups | 2 (one enquiry, one quote) |
| Workflow errors | 0 · skipped by a safety switch: 2 |

**Intentional tests, not a loop and not duplicates.** No message key was sent twice (a retry or a repeated trigger would have repeated one), there were never more than 3 sends in a minute, and every send traces to a numbered test case. The three things that inflated the count:
* **Re-running after fixes.** Real n8n exposed three defects my simulator could not (below). Each fix was re-tested, which re-sent the booking/reminder/quote emails involved.
* **Housekeeping cancellations** (about 5 of the 7 "cancelled" emails): cancelling fictional inspections to keep the test calendar clean sends a real cancellation email.
* **Reminder re-test:** 2 of the 4 reminder emails are the same two bookings verified again after a fix.
Fair criticism: I should have used each test once, grouped cleanups, and told you the expected email count before starting. Nothing is waiting to send more (section 4).

## 2. What passed real testing
**Setup:** four workflows imported inactive with backups; two ROOFORA webhook credentials created; real Airtable base inspected (an existing "Table 1" with 3 records was left untouched) and the missing ROOFORA tables/fields added; a second check reported nothing missing; dedicated calendar created (Europe/London).

**Enquiries:** website → n8n → Airtable with and without photos · attachments stored in Airtable · forged photo permission refused · non-image refused · retry of a photo does not duplicate it · phone preference creates a callback task and no email · urgent enquiry (Priority Urgent, Stage unchanged, "do not promise attendance") · unmatched area flagged not rejected · retry returns the same lead · **3 simultaneous identical submissions → 1 live lead, 2 rows marked Duplicate, 1 email** · another customer address redirected to the test inbox with a `[TEST for …]` subject.
**Telegram:** alerts delivered for new leads, bookings, quote answers and errors (message ids in the executions).
**Inspections:** staff page needs the staff password · confirmation page changes nothing · cross-site confirm refused · real calendar event · booking twice is a no-op · phone customer gets a task not an email · clash and past-time refused · reschedule moves the same event (version 2) · cancel · cancelling twice is a no-op · re-booking reuses the event · **24 h and 2 h reminders fired once each from n8n's stored timers and were recorded.**
**Quotes:** unapproved quote refused · approved quote sent once, only a token hash stored · customer page via the real website route · forged link refused · accept → Won + "schedule job" task with no date promised · accept twice idempotent, decline-after-accept refused · new version supersedes the old one, old link refused · decline → Lost.
**Follow-ups:** enquiry and quote follow-ups sent once, repeated sweeps send nothing more · phone customers get a call task · staff takeover and withdrawn permission stop follow-ups.
**Safety switches:** allowlist blocks any unlisted address (live) · Customer Emails Enabled off sends nothing (live) · a bad Settings value is recorded as "Needs My Help" with a recommended action and a Telegram alert from the real Error Handler execution, and a new enquiry after the fix raises nothing.

**Defects found by real n8n and fixed (each now has an offline regression test):**
1. n8n's Code sandbox has no `URL` global — the staff confirm step crashed (HTTP 500).
2. The "Send Customer Email" sub-workflow returned **no result** to its caller (last-executed-node rule), so reminders were sent but not recorded and quote/follow-up bookkeeping would not have run → all paths now end at one node.
3. A bad Settings value was not reported when no task was created.
4. The reply-to-lead lookup was capped at 5 rows, so with several enquiries on one email address the right lead could be missed (found by the polling-trigger test).

## 3. Reply detection — real result (13:04 UTC, run once, 0 emails sent)
**Passed.** With Customer Emails Enabled OFF the system read the tester's actual reply from the mailbox and:
* matched it to the **correct enquiry (RF-0D1CB6CB) by its Gmail thread**;
* recorded it once ("Email Received" with the Gmail message id), set Follow-up Status to *Paused - Customer Replied*, stamped the reply time and set the next action to "Reply to the customer's email";
* left **all 20 other leads untouched**, including a second test lead that uses the *same email address* but a different thread;
* recorded nothing a second time when the same reply was read again;
* made a due follow-up sweep skip that lead entirely (no step change, no send attempt);
* sent **zero** emails (Gmail Sent unchanged: 48 → 48; 40 ROOFORA + 8 older messages from other projects).
Evidence: `LIVE-TEST-EVIDENCE.md` ("Real reply-detection check"). Three Lead Manager executions, all successful.

**Gmail polling trigger — verified live (second test, 14:02–14:12 UTC, 0 emails sent).** The first on-demand test could not exercise the trigger, so a dedicated test armed it (restricted to mail from the test address, Customer Emails Enabled OFF). Results:
* The trigger **fired by itself** (executions of mode *trigger*, no on-demand check involved in detection) and read the tester's replies.
* **It found a real defect first:** at 13:55 the trigger fired and classified the reply correctly (reply, reference RF-0A16B2BF, thread matched) but the *lead lookup* was capped at 5 rows and filled up with other test leads sharing the same email address, so the right lead was never in the list and nothing was updated. The cap is now 100, the address fallback only considers open leads, and an offline regression test (8 leads, one address) covers it. (The earlier on-demand pass had matched only because its lead happened to be in the first five.)
* After the fix, on its first poll the trigger matched the reply to the **correct enquiry (RF-0A16B2BF)**, recorded it and **paused its follow-ups**. The tester had sent **two** replies (13:52 and 13:56 UTC); both were recorded, **each exactly once** (2 distinct Gmail message ids). The count did not change after two on-demand re-reads of the same mail and a further full poll cycle.
* **Only the correct enquiry was updated:** of all 21 leads the only ones with a reply recorded are RF-0D1CB6CB (earlier test) and RF-0A16B2BF.
* No follow-up or other email was sent (Customer Emails Enabled stayed OFF).
Honest nuance: both replies arrived while the trigger was armed, but the matching only succeeded after the fix, so it was processed when the fixed workflow was re-activated (n8n's trigger re-reads recent mail on activation). I did not stage a third, fresh reply. Unattended reply detection is verified for replies matched by Gmail thread; bounces, auto-replies and STOP remain offline-only.

## 4. Remaining limitations and offline-only recovery checks
**Not verified live (offline/simulated only):**
* *(Gmail polling trigger: now verified live — see §3.)*
* Bounce, auto-reply and STOP classification (no real examples were available).
* Recovery from an unclear Gmail result (timeout → check "Sent" → resend at most once → otherwise "Needs My Help").
* Airtable and Telegram outage handling, and the Error Handler when Airtable itself is down.
* An n8n restart while a reminder timer is waiting.
* The Daily Enquiry Limit (429 `demo-limit`) and the localhost-quote-link guard: built and tested offline; the sync to the real workflows is done but they have not been exercised live (that would require sending emails).
* The access-code gate and the privacy page were checked locally only; nothing is deployed.

**Other limitations:** quote links use the Settings › Website URL (currently `http://localhost:3000`, which only opens on this PC); a company-owned sender, real business details and a legally approved privacy policy do not exist (the privacy page is an accurate *demo* notice with the operator's name/contact/retention left "to be completed").

## 5. Is the development scope complete?
**Yes** for the agreed automation and demo-preparation scope. Every live check required has passed; what remains is offline-only (§4) and the real-business inputs. Testing stops here.

## 6. Genuine deployment blockers / next steps
**Blockers for a *controlled* preview (all small and yours to authorise):**
1. Authorise the preview deploy: commit on `demo/controlled-preview`, add the four **preview-only** Vercel variables (`scripts/vercel-preview-env.mjs`), push that branch (never `main`). Details: `DEPLOY-PREVIEW.md`.
2. After the first preview exists, set Airtable › Settings › **Website URL** to its address (the workflow refuses to send a quote while it is still `localhost` for a deployed enquiry).
3. Create the single Vercel WAF rate-limit rule (Hobby allows exactly one).
4. Provide the demo access code to invitees (it is in `.env.local`).
**Blockers for a *real* roofing company:** real business details, an approved privacy policy, a company-owned sender, a paid Airtable plan — see `DEMO-VS-REAL-SETTINGS.md`.

## 7. Final states
n8n: Lead Manager, Send Customer Email, Error Handler, Airtable Setup Check — **all inactive**, updated to the latest code with backups; temporary harness **deleted**; **0 waiting/running executions**; Gmail polling and daily schedule triggers **disabled again** (saved workflow checked). Airtable Settings: Customer Emails Enabled **OFF**, Test Mode **ON**, recipient and allowlist = test inbox, **Daily Enquiry Limit 5**. Website: not deployed, not pushed; production landing page untouched. Code is on local branch `demo/controlled-preview`, uncommitted.
