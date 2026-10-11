import "server-only";

// Server-side client for the ROOFORA n8n webhooks. The secret header is added
// here and only here; nothing in this file may be imported by browser code.
//
// Env (server-only, never prefix with NEXT_PUBLIC_):
//   N8N_ROOFORA_WEBHOOK_BASE  e.g. https://n8n.walkflow.tech/webhook/roofora
//   N8N_ROOFORA_WEBHOOK_SECRET  must equal the "ROOFORA Website Webhook" Header Auth credential in n8n

export type N8nResult =
  | { kind: "ok"; status: number; data: Record<string, unknown> }
  | { kind: "rejected"; status: number; data: Record<string, unknown> } // n8n answered with 4xx
  | { kind: "failed"; status: number } // n8n answered with 5xx / unexpected
  | { kind: "uncertain" } // timeout or network drop: the request MAY have been processed
  | { kind: "paused" } // webhook not registered: the n8n workflows are switched off (demo paused)
  | { kind: "unconfigured" };

export function n8nConfigured(): boolean {
  return Boolean(process.env.N8N_ROOFORA_WEBHOOK_BASE && process.env.N8N_ROOFORA_WEBHOOK_SECRET);
}

export async function callN8n(
  path: "enquiry" | "photo" | "quote",
  body: unknown,
  timeoutMs = 15_000
): Promise<N8nResult> {
  const base = process.env.N8N_ROOFORA_WEBHOOK_BASE;
  const secret = process.env.N8N_ROOFORA_WEBHOOK_SECRET;
  if (!base || !secret) return { kind: "unconfigured" };

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Roofora-Secret": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    // Never log the body: it contains customer details.
    return { kind: "uncertain" };
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && data && data.ok === true) return { kind: "ok", status: res.status, data };
  // Only an answer written by the ROOFORA workflow itself ({ ok: false, … }) counts as a real "no".
  // n8n's own errors (inactive workflow → 404, bad secret → 403, overload) have no `ok` field and are
  // treated as "unavailable, safe to retry", never as a validation problem with the visitor's input.
  if ([400, 404, 409, 422, 429].includes(res.status) && data && data.ok === false) return { kind: "rejected", status: res.status, data };
  // 404 without a ROOFORA answer = n8n has no live webhook there: the workflows are deliberately switched off.
  if (res.status === 404) return { kind: "paused" };
  return { kind: "failed", status: res.status };
}
