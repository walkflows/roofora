# ROOFORA

Single-page marketing site for ROOFORA, a roofing company. Built with Next.js (App Router), TypeScript, Tailwind CSS v4 and Motion for React.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run start     # run the production build locally
npm run lint      # ESLint
npm run automation:test   # offline checks for the lead automation (no accounts needed)
```

## Everything you'll need to update before launch

**Contact details** — one place only: `lib/config.ts`. Update `CONTACT_DETAILS`, `SOCIAL_LINKS`, and set `CONTACT_DETAILS_ARE_PLACEHOLDERS` to `false` once real values are in.

**Reviews** — `lib/content.ts`, the `REVIEWS` array. These are clearly-labeled sample placeholders (also flagged in the UI). Replace with genuine, approved customer reviews, then set `REVIEWS_ARE_SAMPLE` to `false` to remove the on-page disclosure note.

**Photos** — `lib/images.ts` is the single manifest mapping every photo used on the page to its file and alt text. Swap a photo by replacing the file in `public/images/` (keep the same filename) or by pointing the import at a new file.

**Enquiry form and lead automation** — the form posts to `/api/enquiry`, which validates on the server and hands the enquiry to n8n, which saves it to Airtable and runs the follow-up automation (acknowledgement, inspections, quotes, reminders). The visitor sees success **only after** the lead is confirmed saved. Roof photos are uploaded separately afterwards (`/api/enquiry/photo`). Nothing works until the n8n/Airtable side is connected: without `N8N_ROOFORA_WEBHOOK_BASE` / `N8N_ROOFORA_WEBHOOK_SECRET` the form says submission is unavailable and nothing is faked. Everything about the automation — setup, field mapping, tests, recovery — is in [`automation/`](automation/README.md). Environment variable names are in `.env.example` (values stay in `.env.local` / Vercel).

**SEO / indexing** — `app/layout.tsx`, `app/robots.ts` and `app/sitemap.ts` currently block indexing (`robots: { index: false }`) and use a placeholder domain (`https://roofora.example.com`). Update the domain and flip indexing on once the real domain and business details are confirmed.

**Privacy policy** — the enquiry form should link to one; none exists yet. Add a page and link it from the form and footer before launch.

**Policies** — the footer shows "Privacy Policy" and "Terms" as plain text (not links), since no policy pages exist yet in this single-page build. Turn them into real anchors/pages once that content exists.

## Structure

- `app/page.tsx` — assembles all sections in order for the one-page layout.
- `components/sections/` — one component per homepage section.
- `components/ui/` — shared building blocks (Button, Reveal/WordReveal scroll animations, BeforeAfterSlider, TestimonialCarousel, Accordion, Marquee, Lightbox).
- `components/layout/` — Header, MobileMenu, Footer.
- `components/enquiry/EnquiryForm.tsx` — the enquiry form (photos, validation, retries). Shared rules/wording: `lib/enquiry/contract.ts`; server-only helpers: `lib/server/`.
- `app/api/enquiry`, `app/api/enquiry/photo`, `app/api/quote`, `app/quote/[token]` — server endpoints and the customer quote page.
- `components/chat/ChatWidget.tsx` — bottom-left quick-help widget.
- `lib/config.ts` — contact details, nav links, social links.
- `lib/content.ts` — services, process steps, projects, reviews, FAQs.
- `lib/images.ts` — image manifest (source + alt text).

## Deployment

Not yet deployed. This project has no GitHub remote or Vercel project configured — ROOFERA is intended to have its own new repo and Vercel project (kept separate from any other project).
