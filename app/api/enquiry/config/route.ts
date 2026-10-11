import { NextResponse } from "next/server";
import { demoGateEnabled } from "@/lib/server/demoGate";

// Tells the form, at run time (not build time), whether this deployment is gated by a demo access code.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ requiresAccessCode: demoGateEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
