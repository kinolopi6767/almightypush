import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { createCipher, VapidPushProvider, type PushMessage, type PushProvider, type SendResult, type VapidConfig } from "@pushpanel/core";
import {
  campaigns,
  deliveries,
  domains,
  events,
  subscribers,
  type BetterSQLite3Database,
} from "@pushpanel/db";
import { allTables } from "@pushpanel/db/schema";
import { readSetting } from "./cleanup";

export const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 100;
/** retry backoff: 30s * 2^(attempts-1), capped at 1h */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 3_600_000;
/**
 * Default sends in flight per cycle — overridable per deployment via the
 * `sending_speed` panel setting (settings table, read once per cycle).
 */
const DEFAULT_CONCURRENCY = 25;
/**
 * A delivery left `sending` longer than this is assumed to belong to a dead
 * worker (crash) and is requeued so it still delivers and the campaign can
 * finalize. Must be far above any realistic single-send time.
 */
const STALE_CLAIM_MS = 10 * 60_000;

export interface SendCycleStats {
  claimed: number;
  sent: number;
  failed: number;
  gone: number;
  requeued: number;
}

type PushDb = BetterSQLite3Database<typeof allTables>;

interface DeliveryRow {
  id: number;
  campaign_id: number;
  subscriber_id: number | null;
  domain_id: number;
  attempts: number;
  variant: string | null;
  claimed_at: number | null;
}

/**
 * One send cycle: claim queued deliveries, push them via the domain's VAPID
 * provider, persist terminal state + events. Returns per-bucket counts.
 *
 * The claim is conditional (`UPDATE ... WHERE status='queued'`), so two
 * workers racing for the same rows claim disjoint sets — a delivery is never
 * sent twice. Rows revived from a crashed worker (`claimed_at` too old) are
 * requeued before claiming, so they are picked up again.
 */
export async function runSendCycle(
  db: PushDb,
  encKey: string | undefined,
  provider: PushProvider = new VapidPushProvider(),
  now: number = Date.now(),
): Promise<SendCycleStats> {
  const stats: SendCycleStats = { claimed: 0, sent: 0, failed: 0, gone: 0, requeued: 0 };

  requeueStaleClaims(db, now);

  const candidateIds = db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.status, "queued"),
        sql`(${deliveries.next_attempt_at} IS NULL OR ${deliveries.next_attempt_at} <= ${now})`,
      ),
    )
    .orderBy(desc(deliveries.id))
    .limit(BATCH_SIZE)
    .all();

  if (candidateIds.length === 0) return stats;

  const claimedChanges = db
    .update(deliveries)
    .set({ status: "sending", claimed_at: now, attempts: sql`attempts + 1` })
    .where(and(inArray(deliveries.id, candidateIds.map((r) => r.id)), eq(deliveries.status, "queued")))
    .run();
  if (claimedChanges.changes === 0) return stats;

  const rows = db
    .select({
      id: deliveries.id,
      campaign_id: deliveries.campaign_id,
      subscriber_id: deliveries.subscriber_id,
      domain_id: deliveries.domain_id,
      attempts: deliveries.attempts,
      variant: deliveries.variant,
      claimed_at: deliveries.claimed_at,
    })
    .from(deliveries)
    .where(and(inArray(deliveries.id, candidateIds.map((r) => r.id)), eq(deliveries.status, "sending"), eq(deliveries.claimed_at, now)))
    .orderBy(desc(deliveries.id))
    .all();

  stats.claimed = rows.length;
  if (rows.length === 0) return stats;

  const concurrency = resolveConcurrency(db);
  const utmEnabled = readSetting(db, "utm_enabled") === "1";
  const campaignIds = new Set(rows.map((r) => r.campaign_id));
  const outcomes = await runPool(rows, concurrency, (row) => deliverOne(db, provider, encKey, row, now, utmEnabled));
  for (const outcome of outcomes) {
    if (outcome.result === "sent") stats.sent++;
    else if (outcome.result === "gone") stats.gone++;
    else if (outcome.result === "requeued") stats.requeued++;
    else stats.failed++;
  }

  finalizeCampaigns(db, [...campaignIds]);
  return stats;
}

/** Revive deliveries stuck in `sending` past the stale threshold (crashed worker). */
function requeueStaleClaims(db: PushDb, now: number): void {
  db.update(deliveries)
    .set({ status: "queued", claimed_at: null, next_attempt_at: null })
    .where(and(eq(deliveries.status, "sending"), isNotNull(deliveries.claimed_at), sql`${deliveries.claimed_at} <= ${now - STALE_CLAIM_MS}`))
    .run();
}

/**
 * Bounded-concurrency runner: up to `size` awaits in flight at once.
 * Results stay in input order, so callers keep deterministic accounting.
 */
async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<Outcome>): Promise<{ item: T; result: Outcome }[]> {
  const results = new Array<{ item: T; result: Outcome }>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      const item = items[idx]!;
      try {
        results[idx] = { item, result: await fn(item) };
      } catch {
        results[idx] = { item, result: "failed" };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return results;
}

type Outcome = "sent" | "gone" | "requeued" | "failed";

/** Panel `sending_speed` setting clamped to sane bounds, cached per cycle. */
export function resolveConcurrency(db: PushDb): number {
  const raw = readSetting(db, "sending_speed");
  const value = Number(raw ?? DEFAULT_CONCURRENCY);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_CONCURRENCY;
  return Math.min(Math.floor(value), 200);
}

/** UTM campaign tracking (m10): decorate a click target once, never twice. */
export function withUtm(url: string | null | undefined, title: string, content: "push" | "button"): string | undefined {
  if (!url) return undefined;
  try {
    const target = new URL(url);
    if (!target.searchParams.has("utm_source")) {
      target.searchParams.set("utm_source", "pushpanel");
      target.searchParams.set("utm_medium", "push");
      target.searchParams.set("utm_campaign", title.trim().replace(/\s+/g, "-").slice(0, 64) || "campaign");
      target.searchParams.set("utm_content", content);
    }
    return target.toString();
  } catch {
    return url;
  }
}

async function deliverOne(db: PushDb, provider: PushProvider, encKey: string | undefined, row: DeliveryRow, now: number, utmEnabled = false): Promise<Outcome> {
  // Stale-claim guard: a crashed worker's rows are requeued after
  // STALE_CLAIM_MS; if a slow cycle finds its claim superseded, it must not
  // push — the reviving worker will (double-sends are worse than none).
  if (row.claimed_at !== now) return "requeued";

  const [sub] = db
    .select({ id: subscribers.id, token: subscribers.token, unsubscribed_at: subscribers.unsubscribed_at })
    .from(subscribers)
    .where(eq(subscribers.id, row.subscriber_id ?? -1))
    .limit(1)
    .all();
  if (!sub?.token || sub.unsubscribed_at) {
    db.update(deliveries)
      .set({ status: "failed", error: "subscriber missing or unsubscribed", sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    return "failed";
  }

  const [domain] = db
    .select({ provider_config_json: domains.provider_config_json })
    .from(domains)
    .where(eq(domains.id, row.domain_id))
    .limit(1)
    .all();
  let config: VapidConfig;
  try {
    const raw = domain?.provider_config_json;
    config = raw ? (JSON.parse(raw) as VapidConfig) : ({} as VapidConfig);
    if (!config.publicKey || !config.privateKeyEnc) throw new Error("no vapid config");
  } catch (error) {
    db.update(deliveries)
      .set({ status: "failed", error: `vapid config: ${(error as Error).message}`, sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  const [campaign] = db
    .select({ title: campaigns.title, title_b: campaigns.title_b, message: campaigns.message, launch_url: campaigns.launch_url, icon_url: campaigns.icon_url, image_url: campaigns.image_url, buttons_json: campaigns.buttons_json })
    .from(campaigns)
    .where(eq(campaigns.id, row.campaign_id))
    .limit(1)
    .all();
  if (!campaign) {
    db.update(deliveries).set({ status: "failed", error: "campaign missing", sent_at: now }).where(eq(deliveries.id, row.id)).run();
    return "failed";
  }

  const cipher = createCipher(encKey);
  let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    subscription = JSON.parse(cipher.decrypt(sub.token));
  } catch (error) {
    db.update(deliveries)
      .set({ status: "failed", error: `token decrypt: ${(error as Error).message}`, sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    return "failed";
  }

  // E7: an A/B campaign (title_b set) sends the variant that the scheduler
  // assigned to this delivery — B recipients see title_b, everyone else A.
  const variantTitle = row.variant === "b" && campaign.title_b ? campaign.title_b : campaign.title;

  // Building the message (buttons_json parse), decrypting the VAPID key and
  // sending can all throw. Without the catch, the delivery stays `sending`
  // forever and the stale-claim revive loop retries it at MAX_ATTEMPTS-less
  // infinite churn.
  let result: SendResult;
  try {
    const message: PushMessage = {
      title: variantTitle,
      body: campaign.message ?? undefined,
      icon: campaign.icon_url ?? undefined,
      image: campaign.image_url ?? undefined,
      url: utmEnabled ? withUtm(campaign.launch_url, variantTitle, "push") : (campaign.launch_url ?? undefined),
      buttons: campaign.buttons_json
        ? (JSON.parse(campaign.buttons_json) as NonNullable<PushMessage["buttons"]>).map((b) =>
            utmEnabled ? { ...b, url: withUtm(b.url, variantTitle, "button") ?? b.url } : b,
          )
        : undefined,
      // M8: the service worker echoes these in its click beacon.
      deliveryId: row.id,
      campaignId: row.campaign_id,
      subscriberId: row.subscriber_id ?? undefined,
    };

    const vapid = {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: cipher.decrypt(config.privateKeyEnc),
    };

    result = await provider.send(subscription, message, { vapid, ttl: 86_400, urgency: "normal" });
  } catch (error) {
    db.update(deliveries)
      .set({ status: "failed", error: `send: ${(error as Error).message}`, sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  if (result.ok) {
    db.update(deliveries)
      .set({ status: "sent", sent_at: now, provider_msg: String(result.statusCode), error: null })
      .where(eq(deliveries.id, row.id))
      .run();
    db.insert(events)
      .values({
        domain_id: row.domain_id,
        campaign_id: row.campaign_id,
        subscriber_id: row.subscriber_id,
        type: "delivered",
        meta_json: row.variant ? JSON.stringify({ variant: row.variant }) : undefined,
      })
      .run();
    bumpCampaignStat(db, row.campaign_id, "delivered");
    return "sent";
  }

  if (result.statusCode === 404 || result.statusCode === 410) {
    const reason = result.statusCode === 410 ? "http410" : "http404";
    db.update(deliveries)
      .set({ status: "unsubscribed", error: `push service: ${result.statusCode}`, sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    // Only count out subscribers this worker actually flipped (the row may
    // already be unsubscribed via the unsubscribe route) — `changes === 1`
    // guarantees the decrement matches the flip exactly once.
    const flipped = db
      .update(subscribers)
      .set({ unsubscribed_at: new Date().toISOString(), unsub_reason: reason })
      .where(and(eq(subscribers.id, row.subscriber_id ?? -1), isNull(subscribers.unsubscribed_at)))
      .run();
    if (flipped.changes === 1) {
      db.update(domains)
        .set({ subscribers_count: sql`MAX(${domains.subscribers_count} - 1, 0)` })
        .where(eq(domains.id, row.domain_id))
        .run();
    }
    db.insert(events)
      .values({
        domain_id: row.domain_id,
        campaign_id: row.campaign_id,
        subscriber_id: row.subscriber_id,
        type: "unsubscribed",
        meta_json: JSON.stringify({ reason }),
      })
      .run();
    return "gone";
  }

  // `attempts` was incremented at claim time, so it includes this attempt.
  if (row.attempts >= MAX_ATTEMPTS) {
    db.update(deliveries)
      .set({ status: "failed", error: result.error ?? "unknown", sent_at: now })
      .where(eq(deliveries.id, row.id))
      .run();
    bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (row.attempts - 1), BACKOFF_MAX_MS);
  db.update(deliveries)
    .set({ status: "queued", claimed_at: null, next_attempt_at: now + backoff, error: result.error ?? null })
    .where(eq(deliveries.id, row.id))
    .run();
  return "requeued";
}

function bumpCampaignStat(db: PushDb, campaignId: number, key: "delivered" | "failed") {
  // Single-statement JSON increment: safe under the pool's concurrency
  // (read-modify-write in JS would drop increments on simultaneous sends).
  db.update(campaigns)
    .set({
      stats_json: sql`CASE WHEN json_valid(${campaigns.stats_json})
        THEN json_set(${campaigns.stats_json}, '$.${sql.raw(key)}', COALESCE(json_extract(${campaigns.stats_json}, '$.${sql.raw(key)}'), 0) + 1)
        ELSE json_object('${sql.raw(key)}', 1) END`,
    })
    .where(eq(campaigns.id, campaignId))
    .run();
}

/** A campaign is done once it has no queued/sending deliveries left. */
function finalizeCampaigns(db: PushDb, campaignIds: number[]) {
  for (const id of campaignIds) {
    const [pending] = db
      .select({ value: count() })
      .from(deliveries)
      .where(and(eq(deliveries.campaign_id, id), inArray(deliveries.status, ["queued", "sending"])))
      .all();
    if ((pending?.value ?? 0) !== 0) continue;
    const [sentRow] = db
      .select({ value: count() })
      .from(deliveries)
      .where(and(eq(deliveries.campaign_id, id), eq(deliveries.status, "sent")))
      .all();
    const anySent = (sentRow?.value ?? 0) > 0;
    db.update(campaigns)
      .set({ status: anySent ? "done" : "failed", sent_at: new Date().toISOString() })
      .where(eq(campaigns.id, id))
      .run();
  }
}