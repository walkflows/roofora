# Airtable usage and the Free plan

## The limit
Airtable's support page *"Managing API call limits in Airtable"* (updated 10 Aug 2026) states the **Free plan allows 1,000 API calls per month** (counted per workspace; the per-base burst limit is 5 requests/second). Airtable began enforcing this in 2025. Please confirm the figure on your own account (Account › Billing/usage), because it is Airtable's to change.

## Measured cost (simulated run of the real workflows)
`node automation/tests/budget.mjs` runs one customer through the whole journey against fake services and counts every Airtable request the workflows make:

| Step | API calls |
|---|---|
| Website enquiry (email preference), incl. acknowledgement | 6 |
| One roof photo | 1 |
| Staff opens the Book page | 2 |
| Staff confirms: book inspection + email | 8 |
| 24 h reminder | 6 |
| 2 h reminder | 6 |
| Mark inspection completed | 6 |
| Send approved quote | 10 |
| Customer opens the quote page | 2 |
| Customer accepts | 8 |
| **One complete journey** | **≈ 57** |
| Daily follow-up sweep with nothing due (× ~26 business days) | 2 each ≈ **52 / month** |

So the Free plan covers roughly **16 complete customer journeys a month**, which is plenty for recording demo videos but **not enough for a busy roofing business** — a real launch should use a paid Airtable plan (or accept that automation pauses when the monthly allowance runs out).

These numbers are from the simulation; real counts can differ slightly (for example pagination or retries), so check Airtable's usage page after your first test day.

## What is already economical
* **No frequent empty polling.** The only schedule is once per business morning (2 calls). Reminders use stored wait times, not polling.
* **Batched writes.** The daily sweep updates up to 10 leads per request. Intake tasks are written in one request.
* **Settings are read fresh each time** (1 call) on purpose — so the "Customer Emails Enabled" kill switch takes effect immediately. Caching them would save calls but could keep emailing after you switch it off.
* **Reply detection** costs **2 Airtable calls per incoming email that is not an obvious newsletter or your own mail** (an exact Gmail-thread/reference lookup, then an open-enquiries-by-address lookup that is skipped to a no-op when the exact lookup matched), **plus 1 shared call per run** to avoid recording the same message twice. Use a dedicated ROOFORA mailbox; a mailbox that also receives lots of unrelated mail would burn the allowance. The Gmail poll itself costs no Airtable calls.
* **Gmail, Calendar and Telegram** calls are not counted by Airtable.

## If you hit the limit
Airtable starts refusing requests (HTTP 429/403 style responses). The workflows treat that as a failure: the website shows "could not confirm — safe to resend", nothing is sent to customers, and the Error Handler raises a Telegram alert. Nothing is lost silently.

---

# Controlled-demo budget (Airtable Free plan, ≈1,000 API calls/month)

A paid Airtable plan is **not** required for a controlled portfolio demo. It becomes necessary as soon as there is real customer traffic or the figures below are exceeded. Numbers come from the measured per-step costs above (simulated) plus the live runs; verify on Airtable's usage page after the first demo week.

## What costs calls when nothing is happening ("idle")
| Background operation | Airtable calls |
|---|---|
| Gmail polling trigger (every 5 min, query limited to the test sender) | **0** while no matching mail arrives (the poll uses Gmail, not Airtable). Each *matching* reply costs ≈ 5 calls (two lookups + one shared dedupe read + two writes) |
| Daily follow-up sweep (schedule trigger, disabled today) | 2 per run → **≈ 52–60 / month** if left on. **Recommended for demos: keep it disabled** and run it on demand (`POST /webhook/roofora/sweep`) only when recording → **0 idle** |
| Reminder timers | 0 while waiting (stored in n8n); ≈ 5 calls when each fires |
| Reply on-demand check | 1 list call + ≈ 2–3 per message + 1 shared dedupe read (≈ 5 with recording) |
| Setup / structure checks | ≈ 3–10 per run, only when you run them |

So with the sweep disabled and polling limited to the test sender, **idle cost is 0**.

## A realistic demo month
| Activity | Calls |
|---|---|
| 8 complete recorded journeys (enquiry → quote accepted) × ≈ 57 | ≈ 456 |
| 40 extra test enquiries with no follow-through × ≈ 6 | ≈ 240 |
| Setup checks, rehearsals, re-tests (allowance) | ≈ 100 |
| Idle (sweep disabled) | 0 |
| **Total** | **≈ 800 of 1,000** |

## The cap that protects the allowance
Set Airtable › Settings › **Daily Enquiry Limit**. Worst case = limit × 30 days × ≈ 6 calls per accepted enquiry, so a limit of **5/day ≈ 900/month at most** (and that already leaves no room for follow-through). The recommended demo value is **3–5**; raise it only for a recording day.

## When an upgrade becomes necessary
* More than ≈ **15 complete journeys a month**, or ≈ 12 with the daily sweep left on.
* Any real customer traffic (each real enquiry costs ≈ 6 calls, each staff action ≈ 6–10, each quote ≈ 10).
* Polling a mailbox that receives mail from many senders (each non-newsletter inbound mail costs ≥ 1 call).
* Airtable reporting that calls were blocked (the workflows then fail visibly: the website shows "could not confirm", nothing is emailed, a Telegram alert is sent).
Airtable's published Free allowance can change: confirm it on your account before relying on this table.
