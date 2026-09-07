import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Shared gate for AI-studio endpoints (LLM + you.com calls cost money per
 * request). Authenticated users only, throttled per account so a compromised
 * session or a runaway client cannot burn API credits at line rate.
 */
export async function requireAiAccess(
  req: Request,
  opts?: { limit?: number },
): Promise<{ ok: true; session: Session } | { ok: false; response: NextResponse }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  // AI calls cost money per request — viewers must not burn credits.
  const role = (session.user as { role?: string }).role;
  if (role === "viewer") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Editors only" }, { status: 403 }) };
  }
  const limit = opts?.limit ?? 60;
  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const key = `ai:${session.user.id ?? clientIp(req.headers)}`;
  const rl = rateLimitWithHeaders(key, limit, 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, limit) }),
    };
  }
  return { ok: true, session };
}
