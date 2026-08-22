import { corsJson, handlePublicOptions } from "@/lib/cors";
import { emitEvent } from "@/lib/outbound";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimitWithHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { sha256Hex } from "@pushpanel/core";
import { domains, events, subscribers } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  endpoint: z.string().url().max(2048),
});

/** Public unsubscribe endpoint — called by the client SDK on logout/opt-out. */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rlIp = rateLimitWithHeaders(`unsub:${ip}`, 30, 60_000);
  if (!rlIp.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlIp, 30) });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return corsJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return corsJson({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { domainId, endpoint } = parsed.data;
  const rlDom = rateLimitWithHeaders(`unsub:dom:${domainId}`, 60, 60_000);
  if (!rlDom.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlDom, 60) });
  }
  const tokenHash = sha256Hex(endpoint);

    // The active-only filter matters: after subscribe → unsubscribe →
  // re-subscribe there are two rows with the same token_hash (the partial
  // unique index only dedupes active rows). Without it this would update the
  // stale, already-unsubscribed row and leave the user "unsubscribed" while
  // still receiving pushes.
  const [row] = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, tokenHash), isNull(subscribers.unsubscribed_at)))
    .orderBy(sql`${subscribers.id} DESC`)
    .limit(1)
    .all();
  if (!row) return corsJson({ ok: false, error: "Not subscribed" }, { status: 404 });

  const now = new Date().toISOString();
  db.update(subscribers)
    .set({ unsubscribed_at: now, unsub_reason: "api" })
    .where(eq(subscribers.id, row.id))
    .run();
  db.insert(events).values({ domain_id: domainId, subscriber_id: row.id, type: "unsubscribed" }).run();

  // Keep the domain's counter in sync — the SDK path bypasses the panel.
  const [active] = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();
  db.update(domains).set({ subscribers_count: active?.value ?? 0 }).where(eq(domains.id, domainId)).run();

  emitEvent("unsubscribed", { domain_id: domainId, subscriber_id: row.id });

  return corsJson({ ok: true });
}

/** CORS preflight for cross-origin SDK/API callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
