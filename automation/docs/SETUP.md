# ROOFORA automation — setup guide

Everything here is for **ROOFORA only**. It uses its own Airtable base, Gmail account, Google Calendar and Telegram chat, and it never touches WALKFLOW BUSINESS, FORMERA or the Lead Scraping System.

Nothing in this guide deploys the website or sends anything to real customers. Workflows are imported **inactive**, and the customer-email switch in Airtable Settings starts **off** with Test Mode **on**.

## What you need to set up (and I could not do for you)

| # | What | Where | Status |
|---|---|---|---|
| 1 | An n8n API key for your self-hosted n8n (to import the workflows) | n8n › Settings › n8n API | Waiting for you |
| 2 | The ROOFORA Airtable **base ID** (`appXXXXXXXXXXXXXX`) | Airtable base URL | Waiting for you |
| 3 | The existing Airtable credential's **ID** and confirmation of its token scopes | n8n › Credentials | Waiting for you |
| 4 | Two new n8n credentials: *ROOFORA Website Webhook* and *ROOFORA Staff Access* | n8n › Credentials | Waiting for you |
| 5 | A dedicated ROOFORA Gmail account + Google Calendar + Telegram bot/chat, each as an n8n credential | n8n › Credentials | Waiting for you |
| 6 | The roofing business's **time zone, opening hours, service area, sender address** | Airtable › Settings | Waiting for the business |

The credential you already created for Airtable is reused as-is. Its token stays inside n8n. Do **not** paste any token into chat or into this repository.

---

## Step 1 — Airtable credential type and token scopes

**The n8n credential must be of type *Airtable Personal Access Token API*** (n8n lists it as "Airtable Personal Access Token account"). The older **"Airtable API"** type is the retired API-key system: Airtable answers HTTP 401 for it, and ROOFORA's nodes expect the token type. Found on 11 Oct 2026: the supplied credential `blm4HV8o…` was the legacy type and Airtable rejected it (see `LIVE-TEST-EVIDENCE.md`). If yours is the legacy type, create a new *Airtable Personal Access Token* credential in n8n, paste the token there (inside n8n only), and put its ID in `roofora.config.local.json › credentials.airtable.id`. Then run `node automation/scripts/deploy-n8n.mjs --apply` (it backs up and updates the existing ROOFORA workflows) and `node automation/scripts/live-step1.mjs` to re-verify.

Scopes the token needs (check the existing credential):

A successful "connection test" only proves the token is valid. ROOFORA needs these scopes on the **ROOFORA base only**:

| Scope | Needed for |
|---|---|
| `data.records:read` | reading leads, quotes, settings |
| `data.records:write` | saving leads, tasks, quotes, **and uploading photos** |
| `schema.bases:read` | the Setup Check workflow (reads table/field structure) |
| `schema.bases:write` | **only** if you want the Setup Check to create missing tables/fields for you. You may use a separate temporary token for this and revoke *that* one afterwards. Keep the ongoing runtime token. |

To check: Airtable › Builder hub › Personal access tokens › open the token. Under *Access*, only the ROOFORA base should be selected (not "all bases").

Photo uploads use Airtable's "upload attachment" endpoint (`content.airtable.com`, 5 MB per file). It needs the same `data.records:write` scope and the Base **editor** role.

## Step 2 — create the two webhook credentials in n8n

1. **ROOFORA Website Webhook** — type *Header Auth*. Header name `X-Roofora-Secret`. Value: a long random string you generate (32+ characters). Keep a copy for the website's `.env.local`.
2. **ROOFORA Staff Access** — type *Basic Auth*. Pick a username and a strong password. Staff type it once in their browser when they press an Airtable button.

## Step 3 — the other credentials (all dedicated to ROOFORA)

* **Gmail** (OAuth2) for the ROOFORA mailbox. Customer emails are sent from this account. If you want a different visible sender (for example `hello@roofing-company.com`), add it in Gmail › Settings › Accounts › *Send mail as* and verify it first, then use that address in Settings › Sender Email.
* **Google Calendar** (OAuth2) — create a new calendar called *ROOFORA Inspections* and copy its **Calendar ID** (Calendar settings › Integrate calendar).
* **Telegram** — create a bot with @BotFather, then message it and find the chat ID of the ROOFORA group/chat.

## Step 4 — local files (ignored by Git)

```
copy automation\config\roofora.config.example.json automation\config\roofora.config.local.json
```

Fill in: `n8nBaseUrl` (the **same host** that serves your webhooks — it is used for a staff-page safety check), `airtableBaseId`, `telegramChatId`, `workflowTimezone`, and each credential's `id` and `name`. (A credential's ID is in the address bar when you open it in n8n: `/credentials/<id>`.)

`ROOFERA/.env.local` and `automation/config/roofora.config.local.json` have already been created for you (both ignored by Git). `.env.local` already holds `N8N_API_URL=https://n8n.walkflow.tech`, the webhook base URL, and **freshly generated** values for `N8N_ROOFORA_WEBHOOK_SECRET` and `ROOFORA_PHOTO_TOKEN_SECRET`. You only need to add `N8N_API_KEY`. Copy the webhook secret from `.env.local` into the n8n credential from Step 2 (never into chat). Variable names:

```
N8N_API_URL=
N8N_API_KEY=
N8N_ROOFORA_WEBHOOK_BASE=https://YOUR-N8N-HOST/webhook/roofora
N8N_ROOFORA_WEBHOOK_SECRET=
ROOFORA_PHOTO_TOKEN_SECRET=
```

`N8N_API_URL` / `N8N_API_KEY` are used only by the import script on your computer — never put them on Vercel. The other three are the website's server-side settings (they also go in Vercel's environment settings **when you decide to deploy**; Vercel does not read `.env.local`).

## Step 5 — import the workflows

```
node automation/build/build.mjs                    # rebuilds exports (also run by the tests)
node automation/scripts/deploy-n8n.mjs             # DRY RUN: shows what it would do
node automation/scripts/deploy-n8n.mjs --apply     # creates 4 inactive workflows
```

The script only touches workflows named `ROOFORA — …`, never activates anything, never touches credentials. Before replacing an existing ROOFORA workflow it saves the live version to `automation/backups/<timestamp>/`; it refuses to run if two workflows share a ROOFORA name; and it refuses `--apply` while the config still contains placeholders.

To find the credential IDs without hunting through n8n, run `node automation/scripts/deploy-n8n.mjs --discover`. It is **read-only** and lists the ids and names of credentials that existing workflows on the instance already use (it prints no secrets), so you can copy the Airtable, Gmail, Calendar, Telegram ones into the config. If it prints two workflow IDs, copy them into `roofora.config.local.json › workflowIds`.

*No API key?* You can instead import `automation/dist/*.json` by hand (n8n › Workflows › Import from file). Import in this order: **Error Handler → Send Customer Email → Lead Manager → Airtable Setup Check**, and after each import copy its ID into the config and rebuild, because the later workflows reference the earlier ones.

Then open each workflow, check every node shows its credential, and press **Save**. Do **not** activate yet.

> **Not yet verified on a real n8n:** the import script is tested against a fake n8n API only. If n8n rejects an imported node, the message names the node; send it to me.

## Step 6 — check / build the Airtable base

Open **ROOFORA — Airtable Setup Check** and run **Check Only (no changes)**. Read the `Setup Report` output:

* `needsYou` lists everything missing or different. It never changes existing tables or fields.
* If it says the token cannot read the structure, it names the exact scope to add.
* Run **Create Missing Tables And Fields** to add what is missing and a default Settings row (needs `schema.bases:write`). Run it twice: the second run must report no changes.

The design it checks against is `automation/airtable/schema.json` (human-readable in `DATA-CONTRACT.md`).

Things Airtable's API cannot do, so you do them by hand:
* Create the six **Button** fields — formulas in `automation/samples/airtable-buttons.md`.
* Rename an existing table's first column, change a field's type, or add options to an existing dropdown (the report tells you which).

## Step 7 — fill in Airtable › Settings (one row)

Critical values — **confirm these with the roofing business; do not guess**:

| Field | Meaning | Default |
|---|---|---|
| Business Timezone | IANA name, e.g. `Europe/London`. Not your Lagos time zone unless the business is in Lagos. | *(you must set)* |
| Opening Days / Opening Time / Closing Time | When inspections can be booked | Mon–Fri 08:00–17:00 |
| Inspection Duration Minutes / Travel Buffer Minutes | Slot length and gap around other events | 60 / 30 |
| Service Area Postcode Prefixes / Towns | Used to flag out-of-area enquiries (never auto-rejects) | empty = "Not Checked" |
| Default Owner / Urgent Owner | Who is assigned | Office / Office |
| Enquiry Follow-up Business Days | e.g. `1,3` | 1,3 |
| Quote Follow-up Days | e.g. `2,5,10` | 2,5,10 |
| Sender Email / Sender Name | Visible sender | *(you must set)* |
| Business Phone | Shown in emails | |
| Website URL | Builds quote links, no trailing slash | *(set when the site has a URL)* |
| Calendar ID | The ROOFORA calendar | *(you must set)* |
| **Customer Emails Enabled** | Master switch for **all** customer email | **off** |
| **Test Mode** + Test Recipient Email | Every customer email goes to the test inbox instead | **on** |

## Step 8 — test with synthetic data only

1. Keep **Customer Emails Enabled** off first. Send the sample from `automation/samples/enquiry-email-preference.json` to the **Test URL** (`/webhook-test/roofora/enquiry`) with the secret header. You should get `{"ok":true,…}`, a Leads row, a Telegram alert, and an Activity row saying the email was **not sent** (switch off).
2. Turn **Customer Emails Enabled** on **with Test Mode on and your own test inbox** as Test Recipient. Repeat. The email arrives in the test inbox with a `[TEST for …]` subject.
3. Walk through `DEMO-SCRIPT.md`.
4. Only after you have reviewed everything: set the real Settings, turn Test Mode off. That is the moment real customers can be emailed — and it should happen together with activating the workflows and deploying the website.

## Website → n8n URLs

| Purpose | Production URL | Method |
|---|---|---|
| Enquiry | `<base>/enquiry` | POST (Header Auth) |
| Photo | `<base>/photo` | POST (Header Auth) |
| Quote link | `<base>/quote` | POST (Header Auth) |
| Follow-up sweep on demand | `<base>/sweep` | POST (Header Auth) — same chain as the daily schedule, which stays disabled |
| **Check replies on demand** | `<base>/check-replies` | POST (Header Auth) — reads recent mail matching the configured Gmail query and records replies/bounces/STOP. Verified live; the Gmail *polling* trigger is a separate, disabled node |
| Airtable setup | `<base>/setup-check`, `<base>/setup-create` | POST (Header Auth) — read-only check / add-only create |
| Staff page / confirm | `<n8n>/webhook/roofora/staff` | GET / POST (Basic Auth) |

Add a **Vercel Firewall rate-limit rule** for `/api/enquiry*` and `/api/quote` when you deploy (the in-app limiter is per server instance only).

## Go-live checklist (not to be done until you have reviewed)

- [ ] Real business time zone, hours, service area, sender, calendar confirmed in Settings
- [ ] Gmail sender verified; a test email reached a test inbox from the real sender
- [ ] Privacy policy page exists and is linked from the form (none exists yet)
- [ ] Real contact details replace the placeholders in `lib/config.ts`
- [ ] Workflows activated; Error Handler set on the three that need it (done by the import)
- [ ] Gmail reply detection switched on (`enable.replyDetection`) and daily sweep (`enable.dailySweep`)
- [ ] Vercel environment variables added; Firewall rule added
- [ ] Test Mode turned **off** and Customer Emails Enabled **on** as the very last step
