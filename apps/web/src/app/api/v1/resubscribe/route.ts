import { corsJson, handlePublicOptions } from "@/lib/cors";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, envRateLimit, rateLimitHeaders, rateLimitWithHeaders } from "@/lib/rate-limit";
import { domains, subscribers } from "@pushpanel/db/schema";
import { assertPublicHttpUrl, createCipher, sha256Hex } from "@pushpanel/core";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  /** Previous endpoint when migrating a rotated subscription (SW pushsubscriptionchange). */
  oldEndpoint: z.string().url().max(2048).optional(),
  subscription: z.object({
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((u) => u.startsWith("https://"), "endpoint must be https"),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(128) }),
  }),
});

/**
 * Subscription reconciliation — powers auto-resync.
 *  * Called by the service worker on `pushsubscriptionchange` with oldEndpoint:
 *    the EXISTING subscriber row is updated in place (same id, metadata and
 *    history preserved, no duplicate-active-row).
 *  * Called by the SDK during page-load sync without oldEndpoint: behaves like
 *    an idempotent subscribe (dedupe via the partial unique index).
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`resub:${ip}`, envRateLimit("SUBSCRIBE_RATE_LIMIT", 30), 60_000);
  if (!rl.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 30) });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return corsJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return corsJson({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { domainId, oldEndpoint, subscription } = parsed.data;

  // Same SSRF discipline as subscribe — endpoints are fetched server-side on send.
  const endpointCheck = await assertPublicHttpUrl(subscription.endpoint);
  if (!endpointCheck.ok) return corsJson({ ok: false, error: "Invalid push endpoint" }, { status: 400 });

  const rlDom = rateLimitWithHeaders(`resub:dom:${domainId}`, 120, 60_000);
  if (!rlDom.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlDom, 120) });
  }

  const [domain] = db.select({ id: domains.id }).from(domains).where(and(eq(domains.id, domainId), eq(domains.status, "active"))).limit(1).all();
  if (!domain) return corsJson({ ok: false, error: "Unknown domain" }, { status: 404 });

  const cipher = createCipher(process.env.APP_ENC_KEY);
  const newTokenEnc = cipher.encrypt(JSON.stringify(subscription));
  const newHash = sha256Hex(subscription.endpoint);
  const nowIso = new Date().toISOString();

  // Migration path: rotate the OLD row in place (preserves id + metadata).
  if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
    const oldHash = sha256Hex(oldEndpoint);
    const migrated = db
      .update(subscribers)
      .set({ token: newTokenEnc, token_hash: newHash, provider: "vapid", last_active_at: nowIso })
      .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, oldHash), isNull(subscribers.unsubscribed_at)))
      .run();
    if (migrated.changes > 0) return corsJson({ ok: true, migrated: true });
    // Old row gone (already pruned/unsubscribed) — fall through to insert path.
  }

  // Refresh an active row already keyed to this endpoint…
  const refreshed = db
    .update(subscribers)
    .set({ token: newTokenEnc, last_active_at: nowIso })
    .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, newHash), isNull(subscribers.unsubscribed_at)))
    .run();
  if (refreshed.changes > 0) return corsJson({ ok: true });

  // …otherwise create it. Losing a race against the partial unique index is
  // success by definition (the concurrent writer inserted the same row).
  try {
    // Honor the same per-domain cap as subscribe (only enforced when set).
    const rawCap = Number(process.env.MAX_SUBSCRIBERS_PER_DOMAIN);
    const cap = Number.isFinite(rawCap) && rawCap > 0 ? Math.min(Math.floor(rawCap), 100_000_000) : Number.POSITIVE_INFINITY;
    if (Number.isFinite(cap)) {
      const [active] = db
        .select({ value: count() })
        .from(subscribers)
        .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
        .all();
      if ((active?.value ?? 0) >= cap) {
        return corsJson({ ok: false, error: "Subscriber cap reached" }, { status: 403 });
      }
    }

    db.insert(subscribers)
      .values({
        domain_id: domainId,
        token: newTokenEnc,
        token_hash: newHash,
        provider: "vapid",
        subscribe_at: nowIso,
      })
      .run();
    return corsJson({ ok: true, created: true });
  } catch {
    return corsJson({ ok: true, deduped: true });
  }
}

/** CORS preflight for cross-origin SW/SDK callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
