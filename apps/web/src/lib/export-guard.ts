import { auth } from "@/auth";

export interface ExportContext {
  wsId: number;
  userId: number;
}

/**
 * Shared gate for bulk-export endpoints (campaign CSV, subscriber exports,
 * round-trip PII export). Exports leave the panel boundary — they require an
 * authenticated non-viewer role. Callers must rate-limit BEFORE calling this
 * guard and audit AFTER the rate-limit passes, so a throttled attacker cannot
 * flood the audit log with export attempts.
 *
 * Returns the context on success, or a `Response` to return directly.
 */
export async function requireExportAccess(): Promise<{ ok: true; ctx: ExportContext } | { ok: false; response: Response }> {
  const session = await auth();
  if (!session?.user) return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return { ok: false, response: new Response("No workspace", { status: 400 }) };
  if (session.user.role === "viewer") {
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }
  const userId = Number(session.user.id);
  return { ok: true, ctx: { wsId, userId } };
}
