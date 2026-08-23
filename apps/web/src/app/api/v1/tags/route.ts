import { corsJson, handlePublicOptions } from "@/lib/cors";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, envRateLimit, rateLimitHeaders, rateLimitWithHeaders } from "@/lib/rate-limit";
import { domains, subscribers, subscriberTags } from "@pushpanel/db/schema";
import { sha256Hex } from "@pushpanel/core";

export const dynamic = "force-dynamic";

const MAX_TAGS = 10;

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  endpoint: z.string().url().max(2048),
  /** Flat string tags (OneSignal-style) — values already truncated by the SDK. */
  tags: z.record(z.string().max(64), z.union([z.string().max(200), z.number(), z.boolean()])).refine(
    (t) => Object.keys(t).length >= 1 && Object.keys(t).length <= MAX_TAGS,
    `Provide 1–${MAX_TAGS} tags`,
  ),
});

/**
 * Public tags endpoint — the SDK's setTags() attaches segmentation attributes
 * to the CURRENT browser subscription. Tags power segments and {{token}}
 * personalization at send time.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`tags:${ip}`, envRateLimit("SUBSCRIBE_RATE_LIMIT", 30), 60_000);
  if (!rl.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 30) });
  }
  // Body is needed for the domain id before the resource-level bucket — read it once here.
  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return corsJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return corsJson({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { domainId, endpoint, tags } = parsed.data;

  // Resource-level window so one noisy site cannot starve the shared IP bucket.
  const rlDom = rateLimitWithHeaders(`tags:dom:${domainId}`, 60, 60_000);
  if (!rlDom.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlDom, 60) });
  }

  // Resolve this browser's active subscriber row for the domain.
  const [domain] = db.select({ id: domains.id }).from(domains).where(and(eq(domains.id, domainId), eq(domains.status, "active"))).limit(1).all();
  if (!domain) return corsJson({ ok: false, error: "Unknown domain" }, { status: 404 });

  const tokenHash = sha256Hex(endpoint);
  const [sub] = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domain.id), eq(subscribers.token_hash, tokenHash), isNull(subscribers.unsubscribed_at)))
    .limit(1)
    .all();
  if (!sub) return corsJson({ ok: false, error: "Not subscribed" }, { status: 404 });

  // Replace-all semantics: simplest correct model for setTags().
  try {
    db.transaction((tx) => {
      tx.delete(subscriberTags).where(eq(subscriberTags.subscriber_id, sub.id)).run();
      const rows = Object.entries(tags).map(([tag, value]) => ({
        subscriber_id: sub.id,
        tag,
        value: value === null || value === undefined ? null : String(value),
      }));
      for (const row of rows) tx.insert(subscriberTags).values(row).run();
    });
  } catch {
    return corsJson({ ok: false, error: "Could not save tags" }, { status: 500 });
  }

  return corsJson({ ok: true, count: Object.keys(tags).length });
}

/** CORS preflight for cross-origin SDK callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
