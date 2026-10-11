import "server-only";

// Small per-instance sliding-window limiter. It resets when a server instance
// restarts and is not shared between Vercel instances, so it only slows down
// casual abuse. For production, add a Vercel Firewall rate-limit rule on
// /api/enquiry* as well (see automation/docs/SETUP.md).

const buckets = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) buckets.clear(); // memory guard
  return true;
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}
