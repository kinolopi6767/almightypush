import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { createCipher, VapidPushProvider, type PushMessage, type PushProvider, type SendResult, type VapidConfig } from "@pushpanel/core";
import {
  campaigns,
  deliveries,
  domains,
  events,
  subscribers,
  subscriberTags,
  type BetterSQLite3Database,
} from "@pushpanel/db";
import { allTables } from "@pushpanel/db/schema";
import { readSetting } from "./cleanup";
import { getOutboundConfig } from "./outbound";
import { emitWebhookEvent } from "@pushpanel/core";

export const MAX_ATTEMPTS = 3;
// 1M scale: 500/batch = 1M queued in ~200 batches vs 10k batches at 100. Env tunable for AWS t2.micro (100) vs 4GB VPS (1000)
const BATCH_SIZE = Math.min(Math.max(Number(process.env.WORKER_BATCH_SIZE ?? 500), 50), 2000);
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
    .orderBy(deliveries.id)
    .limit(BATCH_SIZE)
    .all();

  if (candidateIds.length === 0) return stats;

  // Claim via UPDATE ... RETURNING: we get exactly the rows this cycle won.
  // The previous re-select-by-claimed_at approach could match another
  // worker's rows when two cycles claimed within the same millisecond —
  // RETURNING makes double-claiming structurally impossible.
  const wonRows = db
    .update(deliveries)
    .set({ status: "sending", claimed_at: now, attempts: sql`attempts + 1` })
    .where(and(inArray(deliveries.id, candidateIds.map((r) => r.id)), eq(deliveries.status, "queued")))
    .returning({
      id: deliveries.id,
      campaign_id: deliveries.campaign_id,
      subscriber_id: deliveries.subscriber_id,
      domain_id: deliveries.domain_id,
      attempts: deliveries.attempts,
      variant: deliveries.variant,
      claimed_at: deliveries.claimed_at,
    })
    .all();

  const rows = wonRows as DeliveryRow[];

  stats.claimed = rows.length;
  if (rows.length === 0) return stats;

  const concurrency = resolveConcurrency(db);
  const utmEnabled = readSetting(db, "utm_enabled") === "1";
  // Read once per cycle — was a settings SELECT per delivery.
  const fatigueCap = Math.max(0, Math.floor(Number(readSetting(db, "frequency_cap_daily") ?? 0) || 0));
  const campaignIds = new Set(rows.map((r) => r.campaign_id));

  // Batch-fetch campaign + domain configs once per cycle (hot loop optimization).
  const campaignCache = new Map<number, CampaignCache>();
  if (campaignIds.size > 0) {
    const cRows = db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        title_b: campaigns.title_b,
        variants_json: campaigns.variants_json,
        message: campaigns.message,
        launch_url: campaigns.launch_url,
        icon_url: campaigns.icon_url,
        image_url: campaigns.image_url,
        buttons_json: campaigns.buttons_json,
        topic: campaigns.topic,
        ttl: campaigns.ttl,
        urgency: campaigns.urgency,
      })
      .from(campaigns)
      .where(inArray(campaigns.id, [...campaignIds]))
      .all();
    for (const c of cRows) campaignCache.set(c.id, c as CampaignCache);
  }
  const domainCache = new Map<number, string | null>();
  const domainIds = new Set(rows.map((r) => r.domain_id));
  if (domainIds.size > 0) {
    const dRows = db
      .select({ id: domains.id, provider_config_json: domains.provider_config_json })
      .from(domains)
      .where(inArray(domains.id, [...domainIds]))
      .all();
    for (const d of dRows) domainCache.set(d.id, d.provider_config_json ?? null);
  }

  const outcomes = await runPool(rows, concurrency, (row) => deliverOne(db, provider, encKey, row, now, utmEnabled, campaignCache, domainCache, fatigueCap));
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

interface CampaignCache {
  id: number;
  title: string;
  title_b: string | null;
  variants_json: string | null;
  message: string | null;
  launch_url: string | null;
  icon_url: string | null;
  image_url: string | null;
  buttons_json: string | null;
  topic: string | null;
  ttl: number | null;
  urgency: string | null;
}

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
      const slug = title.trim().replace(/\s+/g, "-").slice(0, 64) || "campaign";
      target.searchParams.set("utm_source", "pushpanel");
      target.searchParams.set("utm_medium", "push");
      target.searchParams.set("utm_campaign", slug);
      target.searchParams.set("utm_content", content);
    }
    return target.toString();
  } catch {
    return undefined;
  }
}

async function deliverOne(
  db: PushDb,
  provider: PushProvider,
  encKey: string | undefined,
  row: DeliveryRow,
  now: number,
  utmEnabled = false,
  campaignCache?: Map<number, CampaignCache>,
  domainCache?: Map<number, string | null>,
  fatigueCapCycle = 0,
): Promise<Outcome> {
  // Stale-claim guard: a crashed worker's rows are requeued after
  // STALE_CLAIM_MS; if a slow cycle finds its claim superseded, it must not
  // push — the reviving worker will (double-sends are worse than none).
  if (row.claimed_at !== now) return "requeued";

  // Every terminal write is gated on still owning the claim (claimed_at
  // unchanged). If another worker revived + reclaimed the row while our send
  // was in flight, our late result must not clobber their state.
  const owned = eq(deliveries.claimed_at, now);

  const [sub] = db
    .select({ id: subscribers.id, token: subscribers.token, unsubscribed_at: subscribers.unsubscribed_at })
    .from(subscribers)
    .where(eq(subscribers.id, row.subscriber_id ?? -1))
    .limit(1)
    .all();
  if (!sub?.token || sub.unsubscribed_at) {
    db.update(deliveries)
      .set({ status: "failed", error: "subscriber missing or unsubscribed", sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    return "failed";
  }

  let config: VapidConfig;
  try {
    const raw = domainCache?.has(row.domain_id) ? domainCache.get(row.domain_id) : undefined;
    const providerJson = raw !== undefined ? raw : (() => {
      const [d] = db.select({ provider_config_json: domains.provider_config_json }).from(domains).where(eq(domains.id, row.domain_id)).limit(1).all();
      return d?.provider_config_json ?? null;
    })();
    config = providerJson ? (JSON.parse(providerJson) as VapidConfig) : ({} as VapidConfig);
    if (!config.publicKey || !config.privateKeyEnc) throw new Error("no vapid config");
  } catch (error) {
    const cfgWrite = db
      .update(deliveries)
      .set({ status: "failed", error: `vapid config: ${(error as Error).message}`, sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    if (cfgWrite.changes > 0) bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  const campaign = campaignCache?.get(row.campaign_id) ?? (() => {
    const [c] = db
      .select({ title: campaigns.title, title_b: campaigns.title_b, message: campaigns.message, launch_url: campaigns.launch_url, icon_url: campaigns.icon_url, image_url: campaigns.image_url, buttons_json: campaigns.buttons_json })
      .from(campaigns)
      .where(eq(campaigns.id, row.campaign_id))
      .limit(1)
      .all();
    return c as CampaignCache | undefined;
  })();
  if (!campaign) {
    db.update(deliveries).set({ status: "failed", error: "campaign missing", sent_at: now }).where(and(eq(deliveries.id, row.id), owned)).run();
    return "failed";
  }

  // LumaPush Fatigue Shield: suppress if daily cap reached (0 = disabled) — uses new idx_events_subscriber_type for speed
  const fatigueCap = fatigueCapCycle;
  if (fatigueCap > 0 && row.subscriber_id) {
    const today = new Date().toISOString().slice(0, 10);
    // Optimized: count via indexed subscriber_id + type + date range (avoids full scan at 1M events)
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;
    const [todayCount] = db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.subscriber_id, row.subscriber_id), eq(events.type, "delivered"), sql`${events.ts} BETWEEN ${todayStart} AND ${todayEnd}`))
      .all();
    if ((todayCount?.value ?? 0) >= fatigueCap) {
      const fatWrite = db
        .update(deliveries)
        .set({ status: "failed", error: `fatigue shield: cap ${fatigueCap}/day`, sent_at: now })
        .where(and(eq(deliveries.id, row.id), owned))
        .run();
      if (fatWrite.changes > 0) bumpCampaignStat(db, row.campaign_id, "failed");
      return "failed";
    }
  }

  const cipher = createCipher(encKey);
  let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    subscription = JSON.parse(cipher.decrypt(sub.token));
  } catch (error) {
    db.update(deliveries)
      .set({ status: "failed", error: `token decrypt: ${(error as Error).message}`, sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    return "failed";
  }

  // LumaPush: up to 10 variants via variants_json, fallback to legacy title_b
  let variantTitle = campaign.title;
  let variantMessage = campaign.message;
  let variantImage = campaign.image_url;
  const variantButtonsJson = campaign.buttons_json;
  if (campaign.variants_json && row.variant) {
    try {
      const list = JSON.parse(campaign.variants_json) as { key?: string; title?: string; message?: string; image_url?: string; buttons?: unknown }[];
      const found = Array.isArray(list) ? list.find((v) => v.key === row.variant) : null;
      if (found) {
        if (found.title) variantTitle = found.title;
        if (found.message) variantMessage = found.message;
        if (found.image_url) variantImage = found.image_url;
        // per-variant buttons not yet used
      }
    } catch {
      void 0;
    }
  } else if (row.variant === "b" && campaign.title_b) {
    variantTitle = campaign.title_b;
  }

  // Per-recipient personalization: {{tag_name}} and system tokens
  // ({{country}}, {{city}}, {{browser}}, {{os}}, {{device}}, {{locale}},
  // {{subscriber_id}}) resolved from the subscriber's tags. Unknown or empty
  // tokens render as empty strings — never leak raw {{...}} to users.
  let tokens: Record<string, string> | null = null;
  if (/\{\{\s*\w+\s*\}\}/.test(`${variantTitle}|${variantMessage ?? ""}|${campaign.launch_url ?? ""}`)) {
    tokens = {};
    if (row.subscriber_id) {
      const [subMeta] = db
        .select({ country: subscribers.country, city: subscribers.city, browser: subscribers.browser, os: subscribers.os, device: subscribers.device })
        .from(subscribers)
        .where(eq(subscribers.id, row.subscriber_id))
        .limit(1)
        .all();
      if (subMeta) {
        for (const k of ["country", "city", "browser", "os", "device"] as const) {
          const v = subMeta[k];
          if (v) tokens[k] = v;
        }
      }
      try {
        const tagRows = db
          .select({ tag: subscriberTags.tag, value: subscriberTags.value })
          .from(subscriberTags)
          .where(eq(subscriberTags.subscriber_id, row.subscriber_id))
          .all();
        for (const t of tagRows) if (t.value) tokens[t.tag] = t.value;
      } catch {
        void 0;
      }
    }
    tokens.subscriber_id = String(row.subscriber_id ?? "");
    variantTitle = renderTokens(variantTitle, tokens);
    variantMessage = variantMessage ? renderTokens(variantMessage, tokens) : variantMessage;
  }

  // Building the message (buttons_json parse), decrypting the VAPID key and
  // sending can all throw. Without the catch, the delivery stays `sending`
  // forever and the stale-claim revive loop retries it at MAX_ATTEMPTS-less
  // infinite churn.
  const panelOrigin = (process.env.APP_URL ?? "").replace(/\/$/, "") || undefined;

  let result: SendResult;
  try {
    const message: PushMessage = {
      title: variantTitle,
      body: variantMessage ?? undefined,
      icon: campaign.icon_url ?? undefined,
      image: variantImage ?? undefined,
      url: utmEnabled ? withUtm(campaign.launch_url, variantTitle, "push") : (campaign.launch_url ?? undefined),
      buttons: variantButtonsJson
        ? (JSON.parse(variantButtonsJson) as NonNullable<PushMessage["buttons"]>).map((b) =>
            utmEnabled ? { ...b, url: withUtm(b.url, variantTitle, "button") ?? b.url } : b,
          )
        : undefined,
      // M8: the service worker echoes these in its click beacon.
      deliveryId: row.id,
      campaignId: row.campaign_id,
      subscriberId: row.subscriber_id ?? undefined,
      panelOrigin,
      // lets the SW ignore notification_closed fired by tag-replacement
      issuedAt: now,
    };

    const vapid = {
      subject: config.subject,
      publicKey: config.publicKey,
      privateKey: cipher.decrypt(config.privateKeyEnc),
    };

    const ttl = typeof campaign.ttl === "number" && campaign.ttl >= 0 && campaign.ttl <= 2419200 ? campaign.ttl : 86_400;
    const rawUrgency = campaign.urgency ?? "normal";
    const urgency = (rawUrgency === "very-low" ? "low" : ["low", "normal", "high"].includes(rawUrgency) ? rawUrgency : "normal") as "low" | "normal" | "high";
    const topic = campaign.topic?.slice(0, 64) || undefined;

    result = await provider.send(subscription, message, { vapid, ttl, urgency, topic });
  } catch (error) {
    const failWrite = db
      .update(deliveries)
      .set({ status: "failed", error: `send: ${(error as Error).message}`, sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    if (failWrite.changes > 0) bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  if (result.ok) {
    // Persist the terminal status FIRST — accounting (event + stat) is
    // best-effort afterwards. If the status write lost ownership, skip
    // accounting entirely: another worker owns this delivery now.
    const sentWrite = db
      .update(deliveries)
      .set({ status: "sent", sent_at: now, provider_msg: String(result.statusCode), error: null })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    if (sentWrite.changes === 0) return "requeued";
    try {
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
    } catch {
      // The push went out; losing an analytics row must not mark it failed
      // (that would misreport stats while the delivery stays correctly `sent`).
    }
    return "sent";
  }

  const isGoogleEndpoint = /(^|\.)googleapis\.com$/i.test(new URL(subscription.endpoint).hostname);
  const isGone = result.statusCode === 410 || (result.statusCode === 404 && isGoogleEndpoint);
  if (isGone) {
    const reason = result.statusCode === 410 ? "http410" : "http404";
    const goneWrite = db
      .update(deliveries)
      .set({ status: "unsubscribed", error: `push service: ${result.statusCode}`, sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    if (goneWrite.changes === 0) return "requeued";
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
    try {
      db.insert(events)
        .values({
          domain_id: row.domain_id,
          campaign_id: row.campaign_id,
          subscriber_id: row.subscriber_id,
          type: "unsubscribed",
          meta_json: JSON.stringify({ reason }),
        })
        .run();
    } catch {
      void 0;
    }
    return "gone";
  }

  // `attempts` was incremented at claim time, so it includes this attempt.
  if (row.attempts >= MAX_ATTEMPTS) {
    const failWrite = db
      .update(deliveries)
      .set({ status: "failed", error: result.error ?? "unknown", sent_at: now })
      .where(and(eq(deliveries.id, row.id), owned))
      .run();
    if (failWrite.changes === 0) return "requeued";
    bumpCampaignStat(db, row.campaign_id, "failed");
    return "failed";
  }

  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (row.attempts - 1), BACKOFF_MAX_MS);
  const requeueWrite = db
    .update(deliveries)
    .set({ status: "queued", claimed_at: null, next_attempt_at: now + backoff, error: result.error ?? null })
    .where(and(eq(deliveries.id, row.id), owned))
    .run();
  if (requeueWrite.changes === 0) return "requeued";
  return "requeued";
}

/**
 * Replace {{token}} placeholders with per-subscriber values. Unknown or
 * empty tokens render as "" — a raw {{...}} must never reach the user.
 */
export function renderTokens(input: string, tokens: Record<string, string>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => tokens[key] ?? "");
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
  const webhookConfig = getOutboundConfig(db);
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
    const status = anySent ? "done" : "failed";
    db.update(campaigns)
      .set({ status, sent_at: new Date().toISOString() })
      // Never clobber an operator's `cancelled` (or a fresh `scheduled`)
      // written while this cycle was in flight.
      .where(and(eq(campaigns.id, id), inArray(campaigns.status, ["scheduled", "sending"])))
      .run();
    if (webhookConfig) {
      emitWebhookEvent(webhookConfig, "campaign_done", { campaign_id: id, status });
    }
  }
}