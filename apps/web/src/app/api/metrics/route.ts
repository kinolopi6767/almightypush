import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { collectMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Server metrics — AUTHENTICATED. This payload includes internal details
 * (DB path, automation error strings) and must not be exposed publicly.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Same-origin guard (see export-guard.ts): metrics are session-cookie
  // authenticated GETs, reject cross-site navigations carrying cookies.
  const { isSameOriginRequest } = await import("@/lib/csrf");
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403 });
  }
  // Rate-limit: collectMetrics stats the DB + filesystem on every call — an
  // unbounded authenticated poller (or a forced-refresh loop) is a local DoS.
  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`metrics:${session.user.id ?? clientIp(req.headers)}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 30) });
  }
  // DB path, queue depth and automation errors are operator internals —
  // owner/admin only (viewers/editors use the Server Status page summary).
  // canManage normalizes case/whitespace and fails closed on unknown roles.
  const { canManage } = await import("@/lib/roles");
  const role = (session.user as { role?: string }).role;
  if (!canManage(role)) {
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
