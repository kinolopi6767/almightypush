import { apiJson, handleKeyRouteOptions } from "@/lib/cors";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, envRateLimit, rateLimitHeaders, rateLimitWithHeaders } from "@/lib/rate-limit";
import { domains, events, subscriberTags, subscribers } from "@pushpanel/db/schema";
import { sha256Hex } from "@pushpanel/core";
import { requireApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z.union([z.coerce.number().int().positive(), z.string().trim().min(1).max(253)]),
  event: z.string().trim().min(1).max(64).regex(/^[a-z0-9_.-]+$/i, "event must be [a-z0-9_.-]"),
  endpoint: z.string().url().max(2048).optional(),
  tags: z.record(z.string().max(200)).optional(),
});

/**
 * POST /api/v1/track — generic event ingest (Shopify cart views, custom
 * funnel steps). Key-authenticated (X-Api-Key), workspace + domain scoped.
 *
 * - Resolves `endpoint` → subscriber (active only); unknown endpoints still
 *   return ok:true with `matched:false` so storefront JS never branches.
 * - Merges `tags` (≤10, key ≤64 / value ≤200) via replace-per-key upsert.
 * - Writes an `events` row (type `link_click` with meta.event) for funnels.
 * Rate-limited 120/min/key.
 */
export async function POST(req: Request) {
  const key = requireApiKey(req.headers);
  if (!key.ok) return apiJson({ ok: false, error: key.error }, { status: key.status });
  const ctx = key.context;
  const rl = rateLimitWithHeaders(`track:${ctx.keyId}`, envRateLimit("TRACK_RPM", 120), 60_000);
  if (!rl.allowed) {
    return apiJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 120) });
  }
  // Per-IP global: a compromised key must not allow unbounded event-table growth.
  const rlIp = rateLimitWithHeaders(`track:ip:${clientIp(req.headers)}`, envRateLimit("TRACK_IP_RPM", 600), 60_000);
  if (!rlIp.allowed) {
    return apiJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlIp, 600) });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return apiJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return apiJson({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { domain: domainRef, event, endpoint, tags } = parsed.data;

  // Scoped lookup — never SELECT * all domains (full-table scan + timing leak).
  let domain: { id: number; name: string; workspace_id: number } | undefined;
  if (typeof domainRef === "number") {
    [domain] = db
      .select({ id: domains.id, name: domains.name, workspace_id: domains.workspace_id })
      .from(domains)
      .where(eq(domains.id, domainRef))
      .limit(1)
      .all();
  } else {
    [domain] = db
      .select({ id: domains.id, name: domains.name, workspace_id: domains.workspace_id })
      .from(domains)
      .where(eq(domains.name, domainRef.toLowerCase()))
      .limit(1)
      .all();
  }
  if (!domain || domain.workspace_id !== ctx.workspaceId) {
    return apiJson({ ok: false, error: "Unknown domain" }, { status: 404 });
  }
  if (ctx.domainId != null && ctx.domainId !== domain.id) {
    return apiJson({ ok: false, error: "Domain not covered by this key" }, { status: 403 });
  }

  if (tags && Object.keys(tags).length > 10) {
    return apiJson({ ok: false, error: "At most 10 tags" }, { status: 400 });
  }

  let subscriberId: number | null = null;
  if (endpoint) {
    const hash = sha256Hex(endpoint);
    const [sub] = db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(and(eq(subscribers.domain_id, domain.id), eq(subscribers.token_hash, hash), isNull(subscribers.unsubscribed_at)))
      .limit(1)
      .all();
    if (sub) subscriberId = sub.id;
  }

  // Tags apply per-key (upsert), only when we resolved a subscriber.
  if (subscriberId != null && tags) {
    for (const [k, v] of Object.entries(tags)) {
      const key_ = k.trim().slice(0, 64);
      if (!key_) continue;
      const val = String(v).slice(0, 200);
      const [existing] = db
        .select({ id: subscriberTags.id })
        .from(subscriberTags)
        .where(and(eq(subscriberTags.subscriber_id, subscriberId), eq(subscriberTags.tag, key_)))
        .limit(1)
        .all();
      if (existing) {
        db.update(subscriberTags).set({ value: val }).where(eq(subscriberTags.id, existing.id)).run();
      } else {
        db.insert(subscriberTags).values({ subscriber_id: subscriberId, tag: key_, value: val }).run();
      }
    }
  }

  db.insert(events)
    .values({
      domain_id: domain.id,
      campaign_id: null,
      subscriber_id: subscriberId,
      type: "link_click",
      meta_json: JSON.stringify({ event, source: "track" }),
      ts: new Date().toISOString(),
    })
    .run();

  return apiJson({ ok: true, matched: subscriberId != null });
}

export async function OPTIONS() {
  return handleKeyRouteOptions();
}
