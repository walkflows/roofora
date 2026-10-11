import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed permission to attach photos to ONE saved enquiry.
// Issued by /api/enquiry only after n8n confirms the enquiry was saved, and
// checked by /api/enquiry/photo. It carries the Airtable record ID so photo
// uploads need no extra Airtable lookup (saves API calls on the Free plan).
//
// Env: ROOFORA_PHOTO_TOKEN_SECRET (server-only, 32+ random characters).

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours to finish/retry photo uploads

interface PhotoGrant {
  sid: string; // submission ID
  rid: string; // Airtable lead record ID
  ref: string; // enquiry reference
  n: number; // photos announced with the enquiry
  exp: number;
}

function secret(): string | null {
  const s = process.env.ROOFORA_PHOTO_TOKEN_SECRET;
  return s && s.length >= 32 ? s : null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issuePhotoToken(grant: Omit<PhotoGrant, "exp">): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ ...grant, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function readPhotoToken(token: unknown): PhotoGrant | null {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 1000) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PhotoGrant;
    if (typeof grant.exp !== "number" || grant.exp < Date.now()) return null;
    if (!/^rec[A-Za-z0-9]{14}$/.test(grant.rid)) return null;
    return grant;
  } catch {
    return null;
  }
}
