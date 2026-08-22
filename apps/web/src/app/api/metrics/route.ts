import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { collectMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Server metrics — AUTHENTICATED. This payload includes internal details
 * (DB path, automation error strings) and must not be exposed publicly.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const metrics = await collectMetrics();
  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
