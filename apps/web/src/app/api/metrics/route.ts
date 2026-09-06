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
  // DB path, queue depth and automation errors are operator internals —
  // owner/admin only (viewers/editors use the Server Status page summary).
  const role = (session.user as { role?: string }).role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let metrics;
  try {
    metrics = await collectMetrics();
  } catch {
    return NextResponse.json({ ok: false, error: "Metrics unavailable" }, { status: 503 });
  }
  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
