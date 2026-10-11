# ROOFORA automation

Website enquiry → Airtable lead → qualification → Gmail acknowledgement → inspection (Google Calendar) → approved quote → follow-ups → Won + job task, with Telegram alerts and an error handler.

**Start here:** `CHECKLIST.md` (what is verified / waiting / not done) → `docs/SETUP.md` (what you need to connect) → `docs/DEMO-SCRIPT.md` (what to record).

```
automation/
  CHECKLIST.md            every requirement and its honest status
  airtable/schema.json    the Airtable design (tables, fields, dropdown values) — the contract
  code/lib/*.js           ALL the logic (plain JavaScript, unit-tested)
  build/build.mjs         turns code/lib + schema into n8n workflow JSON
  workflows/              committed exports (placeholders only — safe to share)
  config/                 roofora.config.example.json (copy to .local.json with your IDs; git-ignored)
  scripts/deploy-n8n.mjs  imports the workflows through the n8n API (dry-run by default)
  samples/                synthetic payloads + Airtable button formulas
  tests/                  logic, simulated journeys, simulated setup, import script, budget
  docs/                   SETUP, DEPLOY-PREVIEW, DEMO-VS-REAL-SETTINGS, LIVE-TEST-REPORT, DATA-CONTRACT, WORKFLOWS, AIRTABLE-BUDGET, RECOVERY, DEMO-SCRIPT, TEST-RESULTS
```

Website pieces live in the normal Next.js folders: `components/enquiry/EnquiryForm.tsx`, `lib/enquiry/contract.ts` (shared rules and wording), `lib/server/*` (server-only n8n client, signed photo permission, throttle), `app/api/enquiry`, `app/api/enquiry/photo`, `app/api/quote`, `app/quote/[token]`.

## Commands
```
npm run automation:build     # regenerate automation/workflows/*.json (+ automation/dist/ if a local config exists)
npm run automation:test      # 155 offline checks: logic, 63 simulated journeys, setup workflow, import script
npm run automation:budget    # Airtable calls per journey (simulated)
node automation/scripts/deploy-n8n.mjs [--apply]   # needs N8N_API_URL / N8N_API_KEY in .env.local (backs up before replacing)
node automation/scripts/deploy-n8n.mjs --discover  # read-only: credential IDs already used on the instance
node automation/scripts/live-*.mjs                 # controlled LIVE tests (real services, test inbox only) — read docs/LIVE-TEST-REPORT.md first
```

## Changing things safely
* Wording, rules, schedules → edit `code/lib/*.js` or Airtable › Settings, run `npm run automation:test`, run `automation:build`, re-import (the import script updates the same workflows; it skips any that are **active**, so deactivate first).
* Never edit the exported workflow JSON by hand — the next build overwrites it.
* Field or dropdown names → change `airtable/schema.json` **and** the code that uses them; the simulated Airtable rejects any name that is not in the schema.

## What this is not
It does not use AI to write quotes, assess roofs, set prices or promise attendance. It does not send SMS/WhatsApp, take payments, or enrol anyone in marketing. It does not connect to Supabase or Twilio.
