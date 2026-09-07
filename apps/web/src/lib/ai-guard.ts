import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import { canEdit } from "@/lib/roles";

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
  // Fail closed: unknown/missing roles are viewers (canEdit normalizes).
  const role = (session.user as { role?: string }).role;
  if (!canEdit(role)) {
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
  // Workspace-global cap: N sessions × per-account limit must not multiply
  // AI_API_KEY spend. Single-tenant: one shared budget across the workspace.
  const wsId = (session.user as { workspaceId?: string | null }).workspaceId;
  if (wsId) {
    const rlWs = rateLimitWithHeaders(`ai:ws:${wsId}`, Math.max(limit * 3, 60), 60_000);
    if (!rlWs.allowed) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 }),
      };
    }
  }
  // Session-cookie routes: enforce same-origin when the browser attests one.
  const { isSameOriginRequest } = await import("@/lib/csrf");
  if (!isSameOriginRequest(req)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
