# ROOFORA workflows — what each one does and why there are four

| Workflow | Nodes | Triggered by | Purpose |
|---|---|---|---|
| **ROOFORA — Lead Manager** (main) | ~168 | website webhooks, Airtable staff buttons, daily schedule, Gmail inbox | the whole journey |
| **ROOFORA — Send Customer Email** | 18 | called by the Lead Manager | **every** customer email goes through here, so the safety rules exist once |
| **ROOFORA — Error Handler** | 6 | any crash + problems the workflows report themselves | records "Needs My Help" + one Telegram alert |
| **ROOFORA — Airtable Setup Check** | 18 | by hand, once | verifies/creates the Airtable structure with the existing credential |

You asked for one main workflow and one error workflow. I added two small ones and each earns its place:
* *Send Customer Email* replaces ~11 copies of the same send/check/record steps. One copy means one place where the "never blindly resend" rule can be right.
* *Airtable Setup Check* is the only way to inspect/create the base **without the Airtable token leaving n8n** (you asked that it stay inside n8n's credential system).

The main workflow is large because it carries the whole journey in six labelled sections (A–F), but most nodes are small Code nodes with plain names; their logic lives in `automation/code/lib/*.js` where it is unit-tested. The workflow JSON is **generated** — change the libraries or `build.mjs`, never the exported JSON.

## Lead Manager sections

**A. Website enquiry** — check payload → skip if the Submission ID already exists → save lead (stage, priority, owner, service-area flag, next action, follow-up plan) → duplicate guard → **answer the website** → then, in parallel: acknowledgement email (Email preference), callback/area task (Phone preference, urgent, or uncertain area), Telegram alert.
The visitor waits only for the save, never for emails or alerts.

**B. Photo upload** — one photo per call, uploaded to the lead's `Roof Photos` attachment field. A retry first checks the photo is not already there.

**C. Customer quote link** — looks the quote up by the SHA-256 hash of the link token (the token itself is never stored). *View* changes nothing. *Accept/Decline* only works while the quote is the current `Sent` version and the link has not expired.

**D. Staff buttons** — `book-inspection`, `cancel-inspection`, `complete-inspection`, `send-quote`, `record-accepted`, `record-declined`. A button opens a confirmation page (GET, changes nothing); the confirm button (POST, same-origin only) does the work.
Booking: checks opening hours and calendar clashes (including the travel buffer) → creates or moves the one calendar event for that inspection → only then writes `Scheduled` and emails the customer → waits (stored in n8n's database, so it survives restarts) for the 24 h and 2 h reminders. Each reminder re-reads the inspection before sending and is dropped if the booking changed, was cancelled, or was already reminded.

**E. Daily follow-ups** — once each business morning: 2 Airtable reads, then one batched write. Rechecks every due lead's *current* row before emailing.

**F. Reply detection** — Gmail inbox poll every 5 minutes. Classifies customer reply / bounce / automatic reply / `STOP` / newsletter, and matches the lead by Gmail thread → `RF-` reference → the single open lead with that address. Ambiguous mail is never guessed.

## Reliability design

**Duplicates.** Airtable has **no unique constraint**, so the Submission ID cannot be enforced by the database. The mechanism is: (1) the website reuses one ID per enquiry and disables the button; (2) n8n looks the ID up before saving; (3) after saving, n8n looks for other rows with the same ID and the **earliest** (by Airtable's own `createdTime`, tie-broken by record ID) wins; later rows mark themselves `Duplicate` and send nothing.
*Residual risk:* if two requests with the same ID are processed within the same few milliseconds, both could briefly see only themselves. The website never sends such overlapping requests (single click guard, per-ID throttle). If it ever happened, the worst case is two identical acknowledgement emails and one row marked `Duplicate` later. This is the smallest mechanism that works without adding another service.

**Emails.** A timeout never triggers a blind resend: the workflow waits, searches Gmail's *Sent* folder for the message reference printed in the email, and resends **once** only if it is genuinely absent. If Sent cannot be checked, nothing is resent and the item becomes **Needs My Help**.

**Calendar.** One event per inspection with a fixed ID; pressing Book twice, or after a half-failed attempt, reuses it. Nothing is confirmed to the customer unless the calendar write succeeded.

**Retries.** Bounded: one checked resend for an unclear email; everything else is surfaced rather than retried in a loop. Reminders and follow-ups use stored timestamps in Airtable and n8n's wait storage, not in-memory timers.

**Errors.** Handled problems and crashes both reach the Error Handler → a plain-English row in `Activity` (`Status = Needs My Help`) + **one** Telegram message with *what happened* and *what to do*. Identical alerts are muted for 30 minutes. The Error Handler has no error workflow of its own and calls nothing, so it cannot loop. Personal details are stripped from error text.

**Switches (safe by default).** `Customer Emails Enabled` (master), `Test Mode` (everything goes to your test inbox), per-customer `Permission Withdrawn`. Unreadable Settings = no email.

**Not automated on purpose.** Scope, price, discounts and attendance promises are always entered by staff. The quote can only be sent when `Approved` is ticked and `Approved By` is filled. Acceptance records **Won** and creates a "schedule the job" task; it never promises a job date. Payments/deposits are out of scope.

## Reply matching (exact first, never guessed)
1. **Exact lookup** — Airtable is asked only for enquiries whose Gmail thread id or RF- reference equals the incoming mail's. This is narrow by construction, so no record limit can hide the right enquiry, however many enquiries share the customer's address.
2. **Address lookup** — only when nothing matched exactly: *open* enquiries (not Won/Lost/Duplicate) with the sender's address. Exactly one → matched. More than one (of any number) → **not guessed**.
3. **Unmatchable replies** (several candidates) change no enquiry. They create an Activity "Reply needs matching" (Status *Needs My Help*, no lead link, candidate references listed) plus a Telegram alert, once per Gmail message.
Offline tests E5–E9 cover this (130 other open enquiries on one address; >100 ambiguous; no duplicate task on re-read). Verified offline only — no extra live email was sent for this change.
