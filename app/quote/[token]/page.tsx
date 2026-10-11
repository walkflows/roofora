import type { Metadata } from "next";
import { callN8n } from "@/lib/server/n8n";
import { CONTACT_DETAILS, MAILTO_HREF, TEL_HREF } from "@/lib/config";
import { QuoteActions, type QuoteView } from "./QuoteActions";

export const metadata: Metadata = {
  title: "Your quote",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const TOKEN_RE = /^[a-f0-9]{64}$/;

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let quote: QuoteView | null = null;
  let problem: string | null = null;

  if (!TOKEN_RE.test(token)) {
    problem = "This quote link isn't valid. Please use the link from your quote email.";
  } else {
    const result = await callN8n("quote", { action: "view", token });
    if (result.kind === "ok") quote = result.data.quote as QuoteView;
    else if (result.kind === "rejected") {
      problem = "We couldn't find this quote, or its link has expired. Please reply to your quote email or call us.";
    } else if (result.kind === "paused") {
      problem = "This demo is currently paused, so quotes cannot be shown or answered right now.";
    } else {
      problem = "We can't show your quote right now. Please try again shortly, or contact us.";
    }
  }

  return (
    <section className="bg-cream py-28 sm:py-36">
      <div className="container-roofora max-w-2xl">
        <div className="rounded-card border border-divider bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,0.1)] sm:p-10">
          <h1 className="text-3xl text-ink sm:text-4xl">Your ROOFORA quote</h1>
          {quote ? (
            <QuoteActions token={token} initial={quote} />
          ) : (
            <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {problem}
            </p>
          )}
          <p className="mt-8 text-sm text-ink-soft">
            Questions about this quote? Reply to the quote email,{" "}
            <a href={MAILTO_HREF} className="font-semibold text-ink underline underline-offset-2">
              email us
            </a>{" "}
            or call{" "}
            <a href={TEL_HREF} className="font-semibold text-ink underline underline-offset-2">
              {CONTACT_DETAILS.phoneDisplay}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
