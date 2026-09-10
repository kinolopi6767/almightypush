"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { apiKeys, domains, settings } from "@pushpanel/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateApiKeyToken, naiveLocalToUtcMs, sha256Hex } from "@pushpanel/core";
import { logAudit } from "@/lib/audit";

export type ApiKeyFormState =
  | { error?: string; ok?: boolean; plaintext?: string; label?: string }
  | undefined;

const createSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(64),
  domainId: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().trim().optional().or(z.literal("")),
});

/**
 * Create an API key (H5). The plaintext token is returned exactly once and
 * shown in the UI with a copy button; the DB only ever stores the SHA-256
 * hash, so a DB leak cannot be replayed and resetting a key is the only
 * recovery path (same discipline as subscriber tokens).
 */
export async function createApiKeyAction(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<NonNullable<ApiKeyFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  // RBAC: API keys grant full v1 write access — viewer/editor must not mint them.
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { error: "Only owner/admin can manage API keys" };
  }
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const parsed = createSchema.safeParse({
    label: formData.get("label"),
    domainId: formData.get("domainId") || undefined,
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let domainId: number | null = null;
  if (parsed.data.domainId) {
    const [domain] = db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.id, parsed.data.domainId), eq(domains.workspace_id, workspaceId)))
      .limit(1)
      .all();
    if (!domain) return { error: "Domain not found" };
    domainId = domain.id;
  }

  // The date input is a datetime-local (YYYY-MM-DDTHH:mm) or plain date
  // (YYYY-MM-DD). Both are NAIVE wall-clock values: interpret them in the
  // panel's configured timezone (same as campaign scheduling) — treating
  // them as UTC made keys expire hours off for non-UTC operators.
  let expiresAt: string | null = null;
  if (parsed.data.expiresAt) {
    const raw = parsed.data.expiresAt;
    const [tzRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "timezone")).limit(1).all();
    const timeZone = tzRow?.value || process.env.DEFAULT_TIMEZONE || undefined;
    const endOfDay =
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? naiveLocalToUtcMs(`${raw}T23:59:59`, timeZone)
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)
          ? naiveLocalToUtcMs(raw, timeZone)
          : NaN;
    if (!Number.isFinite(endOfDay)) return { error: "Invalid expiry date" };
    if (endOfDay <= Date.now()) return { error: "Expiry must be in the future" };
    expiresAt = new Date(endOfDay).toISOString();
  }

  const token = generateApiKeyToken();
  const inserted = db
    .insert(apiKeys)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      label: parsed.data.label,
      token_hash: sha256Hex(token),
      expires_at: expiresAt,
    })
    .run();

  const keyId = Number(inserted.lastInsertRowid);
  logAudit(db, { workspaceId, action: "api_key.create", entityType: "api_key", entityId: keyId, meta: { label: parsed.data.label, domain_id: domainId } });
  revalidatePath("/dashboard/api");
  return { ok: true, plaintext: token, label: parsed.data.label };
}

export async function revokeApiKeyAction(keyId: number): Promise<NonNullable<ApiKeyFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    return { error: "Only owner/admin can manage API keys" };
  }
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const [key] = db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!key) return { error: "API key not found" };

  db.delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspace_id, workspaceId)))
    .run();

  logAudit(db, { workspaceId, action: "api_key.revoke", entityType: "api_key", entityId: keyId });
  revalidatePath("/dashboard/api");
  return { ok: true };
}