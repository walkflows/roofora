# ROOFORA

Single-page marketing site for ROOFORA, a roofing company. Built with Next.js (App Router), TypeScript, Tailwind CSS v4 and Motion for React.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run start     # run the production build locally
npm run lint      # ESLint
```

## Everything you'll need to update before launch

**Contact details** — one place only: `lib/config.ts`. Update `CONTACT_DETAILS`, `SOCIAL_LINKS`, and set `CONTACT_DETAILS_ARE_PLACEHOLDERS` to `false` once real values are in.

**Reviews** — `lib/content.ts`, the `REVIEWS` array. These are clearly-labeled sample placeholders (also flagged in the UI). Replace with genuine, approved customer reviews, then set `REVIEWS_ARE_SAMPLE` to `false` to remove the on-page disclosure note.

**Photos** — `lib/images.ts` is the single manifest mapping every photo used on the page to its file and alt text. Swap a photo by replacing the file in `public/images/` (keep the same filename) or by pointing the import at a new file.

**Enquiry form delivery** — `app/api/enquiry/route.ts` validates submissions server-side but does not yet send anywhere (no email/CRM is connected). It currently only logs to the server console. Wire up a real provider (e.g. Resend, SendGrid, or a CRM webhook) at the marked spot before launch.

**SEO / indexing** — `app/layout.tsx`, `app/robots.ts` and `app/sitemap.ts` currently block indexing (`robots: { index: false }`) and use a placeholder domain (`https://roofora.example.com`). Update the domain and flip indexing on once the real domain and business details are confirmed.

**Policies** — the footer shows "Privacy Policy" and "Terms" as plain text (not links), since no policy pages exist yet in this single-page build. Turn them into real anchors/pages once that content exists.

## Structure

- `app/page.tsx` — assembles all sections in order for the one-page layout.
- `components/sections/` — one component per homepage section.
- `components/ui/` — shared building blocks (Button, Reveal/WordReveal scroll animations, BeforeAfterSlider, TestimonialCarousel, Accordion, Marquee, Lightbox).
- `components/layout/` — Header, MobileMenu, Footer.
- `components/chat/ChatWidget.tsx` — bottom-left quick-help widget.
- `lib/config.ts` — contact details, nav links, social links.
- `lib/content.ts` — services, process steps, projects, reviews, FAQs.
- `lib/images.ts` — image manifest (source + alt text).

## Deployment

Not yet deployed. This project has no GitHub remote or Vercel project configured — ROOFERA is intended to have its own new repo and Vercel project (kept separate from any other project).
