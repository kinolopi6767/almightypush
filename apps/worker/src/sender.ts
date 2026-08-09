import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createCipher, VapidPushProvider, type PushMessage, type PushProvider, type VapidConfig } from "@pushpanel/core";
import {
  campaigns,
  deliveries,
  domains,
  events,
  subscribers,
  type BetterSQLite3Database,
} from "@pushpanel/db";
import { allTables } from "@pushpanel/db/schema";

export const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 100;
/** retry backoff: 30s * 2^(attempts-1), capped at 1h */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 3_600_000;

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
}

/**
 * One send cycle: claim queued deliveries, push them via the domain's VAPID
 * provider, persist terminal state + events. Returns per-bucket counts.
 */
export async function runSendCycle(db: PushDb, encKey: string | undefined, provider: PushProvider = new VapidPushProvider()): Promise<SendCycleStats> {
  const stats: SendCycleStats = { claimed: 0, sent: 0, failed: 0, gone: 0, requeued: 0 };
  const now = Date.now();

  const rows = db
    .select({
      id: deliveries.id,
      campaign_id: deliveries.campaign_id,
      subscriber_id: deliveries.subscriber_id,
      domain_id: deliveries.domain_id,
      attempts: deliveries.attempts,
    })
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

  stats.claimed = rows.length;
  if (rows.length === 0) return stats;

  db.update(deliveries)
    .set({ status: "sending", attempts: sql`attempts + 1` })
    .where(inArray(deliveries.id, rows.map((r) => r.id)))
    .run();

  const campaignIds = new Set<number>();
  for (const row of rows) {
    const outcome = await deliverOne(db, provider, encKey, row, now);
    campaignIds.add(row.campaign_id);
    if (outcome === "sent") stats.sent++;
    else if (outcome === "gone") stats.gone++;
    else if (outcome === "requeued") stats.requeued++;
    else stats.failed++;
  }

  finalizeCampaigns(db, [...campaignIds]);
  return stats;
}

type Outcome = "sent" | "gone" | "requeued" | "failed";

async function deliverOne(db: PushDb, provider: PushProvider, encKey: string | undefined, row: DeliveryRow, now: number): Promise<Outcome> {
  const [sub] = db
    .select({ id: subscribers.id, token: subscribers.token, unsubscribed_at: subscribers.unsubscribed_at })
    .from(subscribers)
    .where(eq(subscribers.id, row.subscriber_id ?? -1))
    .limit(1)
    .all();
  if (!sub?.token || sub.unsubscribed_at) {
    db.update(deliveries)
      .set({ status: "failed", error: "subscriber missing or unsubscribed" })
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
      .set({ status: "failed", error: `vapid config: ${(error as Error).message}` })
      .where(eq(deliveries.id, row.id))
      .run();
    return "failed";
  }

  const [campaign] = db
    .select({ title: campaigns.title, message: campaigns.message, launch_url: campaigns.launch_url, icon_url: campaigns.icon_url })
    .from(campaigns)
    .where(eq(campaigns.id, row.campaign_id))
    .limit(1)
    .all();
  if (!campaign) {
    db.update(deliveries).set({ status: "failed", error: "campaign missing" }).where(eq(deliveries.id, row.id)).run();
    return "failed";
  }

  const cipher = createCipher(encKey);
  let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    subscription = JSON.parse(cipher.decrypt(sub.token));
  } catch (error) {
    db.update(deliveries)
      .set({ status: "failed", error: `token decrypt: ${(error as Error).message}` })
      .where(eq(deliveries.id, row.id))
      .run();
    return "failed";
  }

  const message: PushMessage = {
    title: campaign.title,
    body: campaign.message ?? undefined,
    icon: campaign.icon_url ?? undefined,
    url: campaign.launch_url ?? undefined,
  };

  const vapid = {
    subject: config.subject,
    publicKey: config.publicKey,
    privateKey: cipher.decrypt(config.privateKeyEnc),
  };

  const result = await provider.send(subscription, message, { vapid, ttl: 86_400, urgency: "normal" });

  if (result.ok) {
    db.update(deliveries)
      .set({ status: "sent", sent_at: now, provider_msg: String(result.statusCode), error: null })
      .where(eq(deliveries.id, row.id))
      .run();
    db.insert(events)
      .values({ domain_id: row.domain_id, campaign_id: row.campaign_id, subscriber_id: row.subscriber_id, type: "delivered" })
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
    db.update(subscribers)
      .set({ unsubscribed_at: new Date().toISOString(), unsub_reason: reason })
      .where(eq(subscribers.id, row.subscriber_id ?? -1))
      .run();
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
    .set({ status: "queued", next_attempt_at: now + backoff, error: result.error ?? null })
    .where(eq(deliveries.id, row.id))
    .run();
  return "requeued";
}

function bumpCampaignStat(db: PushDb, campaignId: number, key: "delivered" | "failed") {
  const [campaign] = db
    .select({ stats_json: campaigns.stats_json })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1)
    .all();
  if (!campaign) return;
  const stats = (campaign.stats_json ? JSON.parse(campaign.stats_json) : {}) as Record<string, number>;
  stats[key] = (stats[key] ?? 0) + 1;
  db.update(campaigns).set({ stats_json: JSON.stringify(stats) }).where(eq(campaigns.id, campaignId)).run();
}

/** A campaign is done once it has no queued/sending deliveries left. */
function finalizeCampaigns(db: PushDb, campaignIds: number[]) {
  for (const id of campaignIds) {
    const [pending] = db
      .select({ value: count() })
      .from(deliveries)
      .where(and(eq(deliveries.campaign_id, id), inArray(deliveries.status, ["queued", "sending"])))
      .all();
    if ((pending?.value ?? 0) === 0) {
      db.update(campaigns).set({ status: "done", sent_at: new Date().toISOString() }).where(eq(campaigns.id, id)).run();
    }
  }
}
