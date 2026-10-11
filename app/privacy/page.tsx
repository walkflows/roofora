import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy notice (demo)",
  description: "What the ROOFORA demo enquiry form collects, where it goes and how to have it removed.",
  robots: { index: false, follow: false },
};

// This notice describes what the DEMO actually does. It is not legal advice and is not a real company's policy:
// a real roofing company must replace it with its own approved notice.

export default function PrivacyPage() {
  return (
    <section className="bg-cream py-28 sm:py-36">
      <div className="container-roofora max-w-3xl">
        <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.14em] text-accent">
          Demo notice
        </p>
        <h1 className="mt-4 text-3xl text-ink sm:text-4xl">Privacy notice</h1>
        <p className="mt-4 text-ink-soft">
          ROOFORA is a <strong className="text-ink">fictional business used for a portfolio demonstration</strong>. This page
          explains exactly what the demo&apos;s enquiry form does with what you type. Please use fictional details when you try it.
        </p>

        <div className="mt-10 space-y-8 text-ink [&_h2]:mb-2 [&_h2]:text-xl [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          <div>
            <h2>Who runs this demo</h2>
            <p>
              This demo is operated by WALKFLOW (web design and AI automation) as a portfolio demonstration. Contact:{" "}
              <a className="underline" href="mailto:walkflows@gmail.com">walkflows@gmail.com</a>.
            </p>
          </div>

          <div>
            <h2>What the form collects</h2>
            <ul>
              <li>Your full name and phone number.</li>
              <li>Your email address (required only if you ask to be contacted by email).</li>
              <li>Property type, the service you pick, your town or city and (optionally) postcode.</li>
              <li>An optional description of your roof, how soon you need help and your preferred contact method.</li>
              <li>Up to three optional roof photos. Photos are re-saved in your browser before upload, which removes hidden location (GPS) data.</li>
              <li>A record of your permission to be contacted: the exact wording you agreed to, its version and the time.</li>
              <li>A reference number and an internal submission ID so that a retry never creates a second enquiry.</li>
              <li>The demo access code, if one is required, is checked and <strong>not stored</strong>.</li>
            </ul>
            <p className="mt-2">
              The site sets no cookies and has no analytics or advertising trackers. Fonts are served from the site itself.
              The server briefly uses your network address in memory to limit abuse; the application does not store it.
              The hosting provider (Vercel) keeps its own standard request logs.
            </p>
          </div>

          <div>
            <h2>Where it goes</h2>
            <ul>
              <li>An automation server run by the operator (n8n) receives the enquiry.</li>
              <li>Airtable stores the enquiry, your photos, tasks, quotes and a log of messages.</li>
              <li>Gmail sends the acknowledgement, inspection, reminder, quote and follow-up emails. In this demo every email is sent <strong>only to a test inbox</strong>, never to the address you type.</li>
              <li>Google Calendar holds fictional inspection appointments (reference, town, name and phone).</li>
              <li>Telegram sends an internal alert with a summary of the enquiry to the operator.</li>
            </ul>
            <p className="mt-2">Nothing is sold, shared for advertising or used for marketing. Your permission covers contact about this enquiry only.</p>
          </div>

          <div>
            <h2>How long it is kept and how to have it removed</h2>
            <p>
              Demo enquiries are kept only for the demonstration and are deleted when it ends, or earlier on request. To have your test enquiry removed
              earlier, contact the operator and quote your reference (it starts with RF-). To stop any further automated email, reply
              STOP to an email you receive.
            </p>
          </div>

          <div>
            <h2>A real roofing company</h2>
            <p>
              This notice is not legal advice and is not an approved policy. A real company must replace it with its own notice that
              names the company, its lawful basis, retention periods and contact details.
            </p>
          </div>
        </div>

        <p className="mt-10">
          <Link href="/#contact" className="font-semibold text-ink underline underline-offset-2">
            Back to the enquiry form
          </Link>
        </p>
      </div>
    </section>
  );
}
