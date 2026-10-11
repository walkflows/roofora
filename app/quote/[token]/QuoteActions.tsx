"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface QuoteView {
  enquiryRef: string;
  firstName: string;
  version: number;
  amount: number;
  currency: string;
  scope: string;
  validUntil: string | null;
  status: "Sent" | "Accepted" | "Declined" | "Superseded" | "Expired";
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const CLOSED_TEXT: Record<Exclude<QuoteView["status"], "Sent">, string> = {
  Accepted:
    "You've accepted this quote — thank you. We'll contact you to agree a date for the work. No date is confirmed until we do.",
  Declined: "You've declined this quote. If you change your mind, just reply to the quote email or call us.",
  Superseded: "This quote has been replaced by a newer version. Please use the link in your most recent quote email.",
  Expired: "This quote link has expired. Please reply to the quote email or call us and we'll help.",
};

export function QuoteActions({ token, initial }: { token: string; initial: QuoteView }) {
  const [quote, setQuote] = useState(initial);
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(action: "accept" | "decline") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.quote) setQuote(data.quote as QuoteView);
      if (!res.ok || data.ok !== true) setError(data.error ?? "Something went wrong. Please try again.");
      setConfirming(null);
    } catch {
      setError("We couldn't confirm your answer was recorded. Please try again — answering twice is safe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-ink-soft">Reference</dt>
          <dd className="text-ink">
            {quote.enquiryRef} · version {quote.version}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Quoted price</dt>
          <dd className="text-2xl font-bold text-ink">{money(quote.amount, quote.currency)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-ink-soft">Scope of work</dt>
          <dd className="mt-1 whitespace-pre-line text-ink">{quote.scope}</dd>
        </div>
        {quote.validUntil ? (
          <div>
            <dt className="font-semibold text-ink-soft">Link valid until</dt>
            <dd className="text-ink">{new Date(quote.validUntil).toLocaleDateString("en-GB", { dateStyle: "long" })}</dd>
          </div>
        ) : null}
      </dl>

      <div aria-live="polite" className="mt-6">
        {quote.status === "Sent" ? (
          confirming ? (
            <div className="rounded-lg border border-divider bg-cream-soft/40 p-4">
              <p className="text-sm font-semibold text-ink">
                {confirming === "accept"
                  ? `Accept quote version ${quote.version} for ${money(quote.amount, quote.currency)}? We'll then contact you to agree a date — no date is confirmed yet.`
                  : "Decline this quote? You can still contact us later."}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => send(confirming)} disabled={busy}>
                  {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                  {confirming === "accept" ? "Yes, accept quote" : "Yes, decline quote"}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>
                  Go back
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setConfirming("accept")}>Accept this quote</Button>
              <Button variant="secondary" onClick={() => setConfirming("decline")}>
                Decline
              </Button>
            </div>
          )
        ) : (
          <p className="flex gap-2 rounded-lg bg-accent/10 px-4 py-3 text-sm text-ink">
            {quote.status === "Accepted" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            ) : null}
            {CLOSED_TEXT[quote.status]}
          </p>
        )}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
