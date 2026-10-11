# Preview deployment plan (nothing here has been run)

## What exists today (inspected read-only on 11 Oct 2026)
| Item | Finding |
|---|---|
| Vercel project | **`roofora`** in team `walkflows-3906` (Hobby plan), created 26 Sep 2026, framework Next.js, Node 24.x |
| Live URL | https://roofora-rose.vercel.app — the original **landing page only** (production deployment from 26 Sep, `noindex`). It has no enquiry form backend |
| Git link | GitHub **`walkflows/roofora`**, production branch **`main`** (Vercel auto-deploys it). Local `main` equals `origin/main` |
| Build settings | defaults: **`npm run build`** → `next build` (Turbopack); install = `npm install`; no `vercel.json` |
| Environment variables | **none** set on the project |
| Protection | Vercel Authentication on non-custom-domain deployments (`all_except_custom_domains`), fork protection on |

**Do not push to `main`.** That would replace the production landing page with the demo form. The new code is on the local branch `demo/controlled-preview` (uncommitted, nothing pushed). A push of *that* branch creates a **preview** deployment only, protected by Vercel Authentication, so only people signed in to your Vercel team can open it.

## The build command Vercel will run
`npm run build` — verified locally on 11 Oct 2026: compiles with Turbopack, 12 routes incl. /privacy and the API routes. The earlier failure came from `next/font/google` downloading the font during the build, which failed here (most likely Avast's HTTPS inspection certificate is not trusted by Turbopack's own HTTP client; `curl` and the webpack build were unaffected). The font is now self-hosted (`app/fonts/`, SIL OFL licence) so no build step needs the network. No TLS or security setting was changed.

## Steps when you authorise a preview (in this order)
1. Review the working tree: `git status` / `git diff`.
2. Commit on the branch: `git add -A && git commit -m "ROOFORA controlled demo: enquiry form, automation, privacy notice"` (on `demo/controlled-preview`, never on `main`).
3. Add the preview-only variables (values come from your git-ignored `.env.local`, never printed):
   `node automation/scripts/vercel-preview-env.mjs --apply`
   (dry-run first without `--apply`). Names: `N8N_ROOFORA_WEBHOOK_BASE`, `N8N_ROOFORA_WEBHOOK_SECRET`, `ROOFORA_PHOTO_TOKEN_SECRET`, `ROOFORA_DEMO_ACCESS_CODE`. **Production gets none**, so the live landing page stays unchanged.
4. Push the branch only: `git push -u origin demo/controlled-preview`. Vercel builds a preview; note its URL (also shown as `roofora-git-demo-controlled-preview-walkflows-3906.vercel.app`).
5. Set the quote-link address: in Airtable › Settings set **Website URL** to that preview address (no trailing slash). The workflow now **refuses to send a quote** while Website URL is still `localhost` for an enquiry that came from a deployed site, so a broken link can't go out.
6. Add the one Vercel rate-limit rule (below) in the dashboard.
7. Smoke-test with sending OFF: open the preview (signed in), submit with the access code — expect "couldn't confirm" until the workflows are activated.
8. For a recorded demo only: `node automation/scripts/live-toggle.mjs on`, turn **Customer Emails Enabled** on in Airtable, record, then switch it off and run `live-toggle.mjs off`.

Quote links in emails open for people signed in to your Vercel team (Authentication). External recipients would be asked to log in; that is intended for a controlled demo. Links containing `localhost` only ever opened on the computer running the dev site.

## Protection against public visitors (what is real on a Hobby plan)
Checked against Vercel's current documentation (WAF pages updated Aug–Sep 2026). **Do not assume paid features.**
| Control | Status |
|---|---|
| Vercel Authentication on previews | ✅ already on for this project: strangers cannot reach a preview at all |
| **Demo access code** (server-checked, constant-time, 10 wrong guesses / 10 min / IP) | ✅ built; set via `ROOFORA_DEMO_ACCESS_CODE`; without the code `/api/enquiry` answers 401 — verified locally |
| **Daily enquiry cap** in n8n (`Daily Enquiry Limit` in Airtable Settings; refuses new enquiries with 429 beyond it, retries unaffected) | ✅ built and tested offline; set to a small number for demos |
| In-app throttles (per enquiry, per IP; photo uploads; quote answers) | ✅ built, but only per server instance |
| Vercel WAF **rate limiting** | ✅ available on **Hobby**, but **1 rule per project** (max 3 custom rules in total), fixed window 10 s–10 min, counted per IP, **per region**; it must be created in the dashboard (or `vercel firewall`), `vercel.json` only supports deny/challenge. Recommended single rule: *path starts with `/api/` · method POST · 10 requests per 60 s per IP · action 429*. Review changes → Publish |
| Staff actions (book/cancel/send quote) | ✅ live on the **n8n server**, not the website: HTTP Basic Auth password + same-origin confirm. They are not reachable from the public website at all |
| Photo upload / quote endpoints | ✅ signed 2-hour upload permission; 64-hex quote token; both throttled |
Remaining honest gaps: a Hobby rate limit cannot be per-endpoint (one rule), counters are per region, and the n8n server itself is public on the internet (protected by secrets/passwords; consider IP-restricting `/webhook/roofora/staff` at your Hostinger firewall).
