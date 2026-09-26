import { NextResponse } from "next/server";
import { SERVICE_OPTIONS } from "@/lib/content";

const PROPERTY_TYPES = ["Residential", "Commercial", "Other"] as const;

const MAX_LENGTHS = {
  name: 100,
  phone: 30,
  email: 200,
  location: 120,
  details: 2000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Very small in-memory throttle: blocks a burst of submissions from the same
// IP. Resets on deploy/restart — fine for launch scope, but a real rate
// limiter (e.g. Upstash) should replace this if abuse becomes a problem.
const recentSubmissions = new Map<string, number>();
const THROTTLE_WINDOW_MS = 20_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const allowedKeys = ["name", "phone", "email", "propertyType", "service", "location", "details", "website"];
  const data = body as Record<string, unknown>;
  const unexpectedKeys = Object.keys(data).filter((key) => !allowedKeys.includes(key));
  if (unexpectedKeys.length > 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a hidden field real users never fill in. Bots that fill every
  // field will trip this and get a generic success response (no error hint).
  if (isNonEmptyString(data.website)) {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const last = recentSubmissions.get(ip);
  if (last && now - last < THROTTLE_WINDOW_MS) {
    return NextResponse.json(
      { error: "Please wait a moment before sending another enquiry." },
      { status: 429 }
    );
  }

  const name = isNonEmptyString(data.name) ? data.name.trim().slice(0, MAX_LENGTHS.name) : "";
  const phone = isNonEmptyString(data.phone) ? data.phone.trim().slice(0, MAX_LENGTHS.phone) : "";
  const email = typeof data.email === "string" ? data.email.trim().slice(0, MAX_LENGTHS.email) : "";
  const propertyType = typeof data.propertyType === "string" ? data.propertyType.trim() : "";
  const service = typeof data.service === "string" ? data.service.trim() : "";
  const location = isNonEmptyString(data.location)
    ? data.location.trim().slice(0, MAX_LENGTHS.location)
    : "";
  const details = typeof data.details === "string" ? data.details.trim().slice(0, MAX_LENGTHS.details) : "";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please enter your name.";
  if (!phone) errors.phone = "Please enter a phone number.";
  if (email && !EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";
  if (!PROPERTY_TYPES.includes(propertyType as (typeof PROPERTY_TYPES)[number])) {
    errors.propertyType = "Please choose a property type.";
  }
  if (!SERVICE_OPTIONS.includes(service as (typeof SERVICE_OPTIONS)[number])) {
    errors.service = "Please choose a service.";
  }
  if (!location) errors.location = "Please enter the property location.";

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Please check the highlighted fields.", fields: errors }, { status: 400 });
  }

  recentSubmissions.set(ip, now);

  // No email/CRM provider is connected yet. This is the single place to
  // wire one up (e.g. Resend, SendGrid, or a webhook to your CRM) before
  // launch — until then, enquiries are only logged server-side in dev.
  console.log("[ROOFORA enquiry]", {
    name,
    phone,
    email: email || undefined,
    propertyType,
    service,
    location,
    details: details || undefined,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
