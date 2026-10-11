import { NextResponse } from "next/server";
import { callN8n } from "@/lib/server/n8n";
import { allow, clientIp } from "@/lib/server/throttle";

// Accept / decline a quote from the secure link in the quote email.
// Only reached by a deliberate button press (POST); viewing the page never
// changes anything, so email link scanners cannot accept a quote by accident.

const TOKEN_RE = /^[a-f0-9]{64}$/;

export async function POST(request: Request) {
  if (!allow(`quote:${clientIp(request)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Please wait a few minutes and try again." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  if (!body || !TOKEN_RE.test(String(body.token)) || (action !== "accept" && action !== "decline")) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const result = await callN8n("quote", { action, token: body.token });
  if (result.kind === "ok") return NextResponse.json({ ok: true, result: result.data.result, quote: result.data.quote });
  if (result.kind === "rejected") {
    return NextResponse.json(
      { ok: false, error: String(result.data.message ?? "This quote can no longer be answered online."), quote: result.data.quote },
      { status: 409 }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      retryable: true,
      error: "We couldn't confirm your answer was recorded. Please try again — answering twice is safe.",
    },
    { status: 502 }
  );
}
