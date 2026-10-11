import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Controlled-demo gate. When ROOFORA_DEMO_ACCESS_CODE is set, /api/enquiry refuses every submission that does not
// carry the code. The check runs on the server, so hiding or editing the form field cannot bypass it.
// Leave the variable unset for local development (open) — set it on every deployment that is reachable by others.

export function demoGateEnabled(): boolean {
  return Boolean(process.env.ROOFORA_DEMO_ACCESS_CODE);
}

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Constant-time comparison. Returns true when no gate is configured. */
export function demoCodeOk(candidate: unknown): boolean {
  const want = process.env.ROOFORA_DEMO_ACCESS_CODE;
  if (!want) return true;
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 200) return false;
  return timingSafeEqual(digest(candidate.trim()), digest(want.trim()));
}
