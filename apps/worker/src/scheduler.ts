import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { campaigns, deliveries, resolveSegment, subscribers, type BetterSQLite3Database } from "@pushpanel/db";
import { allTables } from "@pushpanel/db/schema";

type PushDb = BetterSQLite3Database<typeof allTables>;

export interface SchedulerStats {
  campaignsStarted: number;
  deliveriesQueued: number;
  skipped: number;
}

interface CampaignRow {
  id: number;
  workspace_id: number;
  domain_id: number | null;
  schedule_at: string | null;
  audience_json: string | null;
  title_b: string | null;
  variants_json: string | null;
  topic: string | null;
}

/**
 * Enqueue deliveries for campaigns whose send time has arrived.
 * `scheduled` + (schedule_at is null or due) → audience resolved from
 * `audience_json` (kind: all = every active subscriber of the domain) →
 * deliveries inserted as `queued`, campaign moved to `sending`.
 * A campaign whose audience is empty is finished immediately (`done`).
 */
export function runScheduler(db: PushDb, now: Date = new Date()): SchedulerStats {
  const stats: SchedulerStats = { campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 };
  const nowIso = now.toISOString();

  const rows = db
    .select({
      id: campaigns.id,
      workspace_id: campaigns.workspace_id,
      domain_id: campaigns.domain_id,
      schedule_at: campaigns.schedule_at,
      audience_json: campaigns.audience_json,
      title_b: campaigns.title_b,
      variants_json: campaigns.variants_json,
      topic: campaigns.topic,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, "scheduled"),
        sql`(${campaigns.schedule_at} IS NULL OR ${campaigns.schedule_at} <= ${nowIso})`,
      ),
    )
    .orderBy(campaigns.id)
    .all();

  for (const row of rows) {
    const outcome = startCampaign(db, row, nowIso);
    stats.campaignsStarted++;
    stats.deliveriesQueued += outcome.queued;
    stats.skipped += outcome.skipped;
  }
  return stats;
}

function startCampaign(db: PushDb, campaign: CampaignRow, nowIso: string): { queued: number; skipped: number } {
  if (!campaign.domain_id) {
    db.update(campaigns)
      .set({ status: "failed" })
      .where(eq(campaigns.id, campaign.id))
      .run();
    return { queued: 0, skipped: 1 };
  }

  const audience = resolveAudience(db, campaign, campaign.domain_id);

  if (audience.length === 0) {
    db.update(campaigns)
      .set({ status: "done", sent_at: nowIso })
      .where(eq(campaigns.id, campaign.id))
      .run();
    return { queued: 0, skipped: 1 };
  }

  // LumaPush: up to 10 variants via variants_json [{key,weight}] or legacy title_b 50/50
  const variants = parseVariants(campaign.variants_json, campaign.title_b);

  // 1M scale: chunk 500 inserts per transaction to avoid 1M-row single tx lock (3min) + OOM
  const CHUNK = Number(process.env.SCHEDULER_CHUNK ?? 500);
  for (let i = 0; i < audience.length; i += CHUNK) {
    const slice = audience.slice(i, i + CHUNK);
    db.transaction((tx) => {
      for (const subscriberId of slice) {
        const variant = variants ? pickVariant(subscriberId, variants) : campaign.title_b ? (subscriberId % 2 === 0 ? "a" : "b") : null;
        tx.insert(deliveries)
          .values({
            campaign_id: campaign.id,
            subscriber_id: subscriberId,
            domain_id: campaign.domain_id!,
            requested_at: Date.now(),
            variant,
          })
          .run();
      }
      if (i === 0) {
        tx.update(campaigns)
          .set({ status: "sending" })
          .where(eq(campaigns.id, campaign.id))
          .run();
      }
    });
  }
  // Edge: ensure campaign marked sending even if chunked (first chunk already did)
  if (audience.length > 0) {
    db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, campaign.id)).run();
  }

  return { queued: audience.length, skipped: 0 };
}

/**
 * Audience kinds (stored in campaigns.audience_json):
 * - `{ kind: "all" }` — every active subscriber of the domain (M2)
 * - `{ kind: "manual", ids: number[] }` — explicit subscriber list; ids are
 *   re-validated against the domain at run time (M4 delayed welcome pushes,
 *   so a delayed welcome never leaks to subscribers it wasn't meant for).
 * - `{ kind: "segment", segment_id }` — segment membership (M5)
 */
function resolveAudience(db: PushDb, campaign: CampaignRow, domainId: number): number[] {
  let kind = "all";
  let segmentId: number | undefined;
  let ids: number[] | undefined;
  try {
    const parsed = campaign.audience_json ? JSON.parse(campaign.audience_json) : {};
    kind = parsed.kind ?? "all";
    segmentId = parsed.segment_id;
    if (Array.isArray(parsed.ids)) {
      ids = parsed.ids.filter((id: unknown): id is number => Number.isFinite(id as number) && (id as number) > 0);
    }
  } catch {
    kind = "all";
  }

  if (kind === "segment" && segmentId) {
    const match = resolveSegment(db, {
      workspaceId: campaign.workspace_id,
      segmentId,
      domainId,
    });
    return match.subscriberIds;
  }
  if (kind === "manual") {
    if (!ids || ids.length === 0) return [];
    const rows = db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(and(inArray(subscribers.id, ids), eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
      .all();
    return rows.map((r) => r.id);
  }
  if (kind !== "all") return [];

  const rows = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .orderBy(subscribers.id)
    .all();
  return rows.map((r) => r.id);
}

function parseVariants(json: string | null, titleB: string | null): { key: string; weight: number }[] | null {
  if (json) {
    try {
      const arr = JSON.parse(json) as { key?: string; weight?: number; title?: string }[];
      if (Array.isArray(arr) && arr.length > 1 && arr.length <= 10) {
        const cleaned = arr
          .map((v, i) => ({ key: v.key ?? String.fromCharCode(65 + i), weight: Math.max(1, Math.min(100, Number(v.weight) || 10)) }))
          .filter((v) => v.key);
        if (cleaned.length > 1) return cleaned;
      }
    } catch {
      void 0;
    }
  }
  if (titleB) return [{ key: "a", weight: 50 }, { key: "b", weight: 50 }];
  return null;
}

function pickVariant(subscriberId: number, variants: { key: string; weight: number }[]): string {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  // deterministic weighted pick via subscriberId hash (LCG)
  let h = subscriberId * 2654435761;
  h = (h ^ (h >>> 16)) >>> 0;
  const r = h % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (r < acc) return v.key;
  }
  return variants[0]!.key;
}
