import { NextResponse } from "next/server";
import {
  CONSENT_VERSION,
  CONSENT_WORDING,
  CONTRACT_VERSION,
  ENQUIRY_KEYS,
  enquiryRefFor,
  isUuid,
  validateEnquiry,
} from "@/lib/enquiry/contract";
import { callN8n } from "@/lib/server/n8n";
import { issuePhotoToken } from "@/lib/server/photoToken";
import { allow, clientIp } from "@/lib/server/throttle";
import { demoCodeOk, demoGateEnabled } from "@/lib/server/demoGate";
import { CONTACT_DETAILS } from "@/lib/config";

const MAX_BODY_BYTES = 20_000;
const MIN_FILL_MS = 3_000;

const RETRY_MESSAGE =
  "We couldn't confirm that your enquiry was received. Please try again — it is safe to resend, and it won't create a duplicate.";

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail(413, "This enquiry is too large to send.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail(400, "Invalid request.");
  const data = body as Record<string, unknown>;

  if (Object.keys(data).some((key) => !(ENQUIRY_KEYS as string[]).includes(key))) {
    return fail(400, "Invalid request.");
  }

  // Controlled demo: no access code, no submission. Wrong guesses are throttled per IP.
  if (demoGateEnabled()) {
    if (!allow(`code:${clientIp(request)}`, 10, 10 * 60_000)) return fail(429, "Too many attempts. Please wait a few minutes.");
    if (!demoCodeOk(data.accessCode)) {
      return fail(401, "This is a controlled demo. Please enter the demo access code you were given.", {
        fields: { accessCode: "That demo access code is not recognised." },
      });
    }
  }

  // Honeypot: a hidden field only bots fill in. They get a bland answer and
  // nothing is saved. Real visitors never reach this branch.
  if (typeof data.website === "string" && data.website.trim() !== "") {
    return NextResponse.json({ ok: true, enquiryRef: null });
  }

  // Forms completed faster than a person can type are refused (not faked).
  const startedAt = typeof data.startedAt === "number" ? data.startedAt : 0;
  if (!startedAt || Date.now() - startedAt < MIN_FILL_MS) {
    return fail(429, "Please take a moment to check your details, then send again.");
  }

  const ip = clientIp(request);
  const submissionId = isUuid(data.submissionId) ? data.submissionId : "invalid";
  // At most 10 attempts per enquiry and 12 requests per IP in 10 minutes:
  // plenty for genuine retries, too few for bulk spam.
  if (!allow(`sub:${ip}:${submissionId}`, 10, 10 * 60_000)) {
    return fail(429, "Please wait a few minutes before trying again.");
  }
  if (!allow(`ip:${ip}`, 12, 10 * 60_000)) {
    return fail(429, "Please wait a few minutes before sending another enquiry.");
  }

  const result = validateEnquiry(data);
  if (!result.ok) return fail(400, "Please check the highlighted fields.", { fields: result.errors });
  const enquiry = result.data;
  const enquiryRef = enquiryRefFor(enquiry.submissionId);
  const receivedAt = new Date().toISOString();

  const n8n = await callN8n("enquiry", {
    contractVersion: CONTRACT_VERSION,
    source: "roofora-website",
    environment: process.env.VERCEL_ENV ?? "development",
    enquiryRef,
    receivedAt,
    ...enquiry,
    consent: { given: true, wording: CONSENT_WORDING, version: CONSENT_VERSION, recordedAt: receivedAt },
  });

  switch (n8n.kind) {
    case "unconfigured":
      return fail(
        503,
        process.env.NODE_ENV === "development"
          ? "Enquiry saving is not configured in this environment (N8N_ROOFORA_WEBHOOK_BASE / N8N_ROOFORA_WEBHOOK_SECRET). Nothing was saved."
          : `Online enquiries are temporarily unavailable. Please call us on ${CONTACT_DETAILS.phoneDisplay}.`
      );
    case "paused":
      return fail(503, "This demo is currently paused, so your enquiry was not sent and nothing was saved. Please try again when the demo is running.", { retryable: false, paused: true });
    case "uncertain":
      return fail(504, RETRY_MESSAGE, { retryable: true });
    case "failed":
      return fail(502, RETRY_MESSAGE, { retryable: true });
    case "rejected":
      if (n8n.data.error === "demo-limit") return fail(429, "This demo has reached its daily limit of test enquiries. Please try again tomorrow.");
      return fail(400, "Please check the highlighted fields.", {
        fields: (n8n.data.fields as Record<string, string>) ?? {},
      });
    case "ok": {
      const leadRecordId = String(n8n.data.leadRecordId ?? "");
      const savedRef = String(n8n.data.enquiryRef ?? enquiryRef);
      const photoToken =
        enquiry.photoCount > 0 && n8n.data.acceptsPhotos === true
          ? issuePhotoToken({ sid: enquiry.submissionId, rid: leadRecordId, ref: savedRef, n: enquiry.photoCount })
          : null;
      return NextResponse.json({
        ok: true,
        enquiryRef: savedRef,
        duplicate: n8n.data.status === "duplicate",
        preferredContact: enquiry.preferredContact,
        photoToken,
        photosUnavailable: enquiry.photoCount > 0 && !photoToken,
      });
    }
  }
}
