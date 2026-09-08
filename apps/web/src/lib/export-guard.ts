import { auth } from "@/auth";
import { canEdit, canManage } from "@/lib/roles";
import { isSameOriginRequest } from "@/lib/csrf";

export interface ExportContext {
  wsId: number;
  userId: number;
}

/**
 * Reject cross-site navigation-triggered downloads. Session cookies are
 * SameSite=Lax, which still sends cookies on top-level cross-site GET
 * navigations (victim clicks attacker link → authenticated CSV download
 * starts, spamming audit + disk). When the browser sends Origin/Referer it
 * must match the panel origin; non-browser callers (no headers) pass.
 */
function sameOriginResponse(req: Request | undefined): Response | null {
  if (req && !isSameOriginRequest(req)) {
    return new Response("Origin not allowed", { status: 403 });
  }
  return null;
}

/**
 * Shared gate for bulk-export endpoints (campaign CSV, subscriber exports,
 * round-trip PII export). Exports leave the panel boundary — they require an
 * authenticated non-viewer role. Callers must rate-limit BEFORE calling this
 * guard and audit AFTER the rate-limit passes, so a throttled attacker cannot
 * flood the audit log with export attempts.
 *
 * Credential/PII exports (decrypted push tokens) require owner/admin via
 * `requireCredentialExportAccess` — editors must never receive live keys.
 *
 * Returns the context on success, or a `Response` to return directly.
 */
export async function requireExportAccess(req?: Request): Promise<{ ok: true; ctx: ExportContext } | { ok: false; response: Response }> {
  const session = await auth();
  if (!session?.user) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  const crossSite = sameOriginResponse(req);
  if (crossSite) return { ok: false, response: crossSite };
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return { ok: false, response: new Response("No workspace", { status: 400 }) };
  if (!canEdit(session.user.role)) {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  const userId = Number(session.user.id);
  // A malformed session id must not flow into audit rows as NaN.
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  return { ok: true, ctx: { wsId, userId } };
}

/** Owner/admin only — for endpoints that decrypt push credentials. */
export async function requireCredentialExportAccess(req?: Request): Promise<{ ok: true; ctx: ExportContext } | { ok: false; response: Response }> {
  const session = await auth();
  if (!session?.user) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  const crossSite = sameOriginResponse(req);
  if (crossSite) return { ok: false, response: crossSite };
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return { ok: false, response: new Response("No workspace", { status: 400 }) };
  if (!canManage(session.user.role)) {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  return { ok: true, ctx: { wsId, userId } };
}
