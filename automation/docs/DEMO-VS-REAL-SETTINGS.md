# Settings: controlled public demo vs a real roofing company

ROOFORA is a **portfolio demonstration**. Nothing below is approved for production use, and none of the demo values are real business information.

## A. Controlled public demo (what is already configured, and what to keep)
| Setting | Demo value | Notes |
|---|---|---|
| Business name | `ROOFORA Demo` | Fictional. Show a visible "demo / fictional business" label on the page. |
| Business time zone / hours | Europe/London, Mon–Fri 08:00–17:00 | Editable demo values, not a real company's hours. |
| Owner | `Office` | Placeholder name. |
| Service area | blank ("Not Checked") | Nothing is rejected; every location is flagged for review. |
| Business phone | unconfigured | Emails simply omit it. Do not publish a fictional number as real. |
| Sender | the connected Gmail account, display name `ROOFORA Demo` | Must be an account you own and may send from. |
| **Test Mode** | **ON** | Every customer email goes only to the test inbox. |
| **Email Allowlist** | the test inbox only | Hard stop even if Test Mode is accidentally switched off. |
| **Customer Emails Enabled** | **OFF** by default; switch ON only for a recorded demo | Turn it OFF again straight afterwards. |
| Website URL | `http://localhost:3000` now; the **preview/demo URL** once deployed | Quote links are built from this. The workflow refuses to send a quote while it is still localhost for a deployed enquiry. |
| **Demo access code** | set `ROOFORA_DEMO_ACCESS_CODE` on the deployment | Without it `/api/enquiry` refuses everything. Share it only with invitees. |
| **Daily Enquiry Limit** | `5` | Protects the test inbox and the Airtable allowance. Raise only for a recording day. |
| Airtable plan | **Free is enough** for a controlled demo | Budget: `AIRTABLE-BUDGET.md` (≈800 calls in a realistic month; idle cost 0 with the daily sweep disabled). |
| Calendar | the dedicated "ROOFORA Inspections (TEST)" calendar | Never a real or personal calendar. |
| Telegram | the existing internal alert chat, alerts prefixed `ROOFORA — TEST ·` | Clear `alertPrefix` only for a real business. |
| Quote amounts, names, addresses in demos | fictional | Label any sample listing/price as a sample. |

Demo rules: fictional leads only; one test inbox you control; do not give the demo form URL to the public with emails switched on; keep photos synthetic; remove the demo data before showing a real client.

## B. Real information needed for an actual roofing company (never invented here)
Required before any real customer is contacted:
* Legal business name, trading address, registered number, VAT details (if applicable) and a real **contact phone and email** (replace the placeholders in `lib/config.ts`).
* **Privacy policy** and cookie/terms pages written and approved for that company and country — the form links to the privacy notice; the demo ships an accurate *demo* notice at `/privacy` that a real company must replace.
* A **sender address the company owns** (verified in Gmail "Send mail as" or its own mailbox) and its real display name.
* **Business time zone**, opening days/hours, inspection length, travel buffer.
* **Service area** (postcode prefixes / towns) and who is the owner/urgent contact.
* Follow-up wording approved by the company, follow-up timing, quote validity period, currency.
* A dedicated company calendar, Telegram/alert destination and a monitored inbox for customer replies.
* A **paid Airtable plan** once real customers use it (not needed for the demo — see the budget).
* An agreed emergency-call policy (the system never promises an emergency visit).
Then, in this order: set real Settings → verify sender with one test to the company's own inbox → turn Test Mode OFF and clear the Email Allowlist **only** as the last step, together with activating the workflows and deploying the website. That step is a production decision and is not made by this project.
