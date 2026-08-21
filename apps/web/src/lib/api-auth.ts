import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys, settings } from "@pushpanel/db/schema";
import { rateLimitWithHeaders, envRateLimit } from "@/lib/rate-limit";
import { sha256Hex } from "@pushpanel/core";

/**
 * API v1 key authentication (H5 real): requests present `X-Api-Key: <token>`.
 * Tokens are generated once (plaintext shown a single time), stored only as
 * SHA-256 hashes, optionally domain-scoped, and can be revoked or expired.
 *
 * The G8 "API access" toggle gates ALL v1 key-authenticated routes: when it
 * is off, key auth refuses everything (401/403 path stays intact elsewhere).
 */

export interface ApiKeyContext {
  workspaceId: number;
  keyId: number;
  domainId: number | null;
}

export type ApiKeyResult = { ok: true; context: ApiKeyContext } | { ok: false; error: string; status: number };

/** Panel setting used by the G8 toggle. */
export const API_ACCESS_SETTING = "api_access_enabled";

export function readApiAccessEnabled(): boolean {
  const [row] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, API_ACCESS_SETTING)).limit(1).all();
  return row?.value !== "0"; // default ON
}

/**
 * Resolve `X-Api-Key` to a workspace-scoped key. Rejects unknown, expired
 * and revoked (deleted) keys; rate-limits per key; refreshes last_used_at
 * at most once per minute so hot routes don't hammer the DB.
 */
export function requireApiKey(headers: Headers): ApiKeyResult {
  // G8: the panel-wide "API access" toggle gates every key-authenticated route.
  if (!readApiAccessEnabled()) {
    return { ok: false, error: "API access is disabled", status: 403 };
  }

  const token = headers.get("x-api-key");
  if (!token || token.length < 16 || token.length > 256) {
    return { ok: false, error: "Missing or malformed X-Api-Key", status: 401 };
  }

  const [key] = db
    .select({ id: apiKeys.id, workspace_id: apiKeys.workspace_id, domain_id: apiKeys.domain_id, expires_at: apiKeys.expires_at, last_used_at: apiKeys.last_used_at })
    .from(apiKeys)
    .where(eq(apiKeys.token_hash, sha256Hex(token)))
    .limit(1)
    .all();
  if (!key) return { ok: false, error: "Invalid API key", status: 401 };

  if (key.expires_at && key.expires_at <= new Date().toISOString()) {
    return { ok: false, error: "API key expired", status: 401 };
  }

  const rl = rateLimitWithHeaders(`apikey:${key.id}`, envRateLimit("API_KEY_RPM", 300), 60_000);
  if (!rl.allowed) {
    // Caller should attach rate-limit headers; we return status 429 here and let route add headers if needed
    return { ok: false, error: "Rate limit exceeded", status: 429 };
  }

  // Throttled last-used refresh: only when the previous stamp is >1 min old.
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  if (!key.last_used_at || key.last_used_at < minuteAgo) {
    db.update(apiKeys).set({ last_used_at: new Date().toISOString() }).where(eq(apiKeys.id, key.id)).run();
  }

  return {
    ok: true,
    context: { workspaceId: key.workspace_id, keyId: key.id, domainId: key.domain_id },
  };
}

/** Verify domain scope: a key with domain_id may only act on that domain. */
export function domainAllowed(context: ApiKeyContext, domainId: number): boolean {
  return context.domainId === null || context.domainId === domainId;
}