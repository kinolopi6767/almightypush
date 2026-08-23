import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { campaigns, deliveries, events, resolveSegment, subscribers, type BetterSQLite3Database } from "@pushpanel/db";
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
    // Per-campaign isolation: a poison-pill campaign (bad audience, oversized
    // id list, corrupt config…) must be marked failed here instead of throwing
    // past the loop — otherwise it stays `scheduled`, rethrows every tick and
    // permanently stalls the whole send pipeline.
    try {
      const outcome = startCampaign(db, row, nowIso);
      stats.campaignsStarted++;
      stats.deliveriesQueued += outcome.queued;
      stats.skipped += outcome.skipped;
    } catch {
      stats.skipped++;
      try {
        // Mark failed so it never re-matches the due-campaigns query.
        db.update(campaigns)
          .set({ status: "failed" })
          .where(and(eq(campaigns.id, row.id), eq(campaigns.status, "sending")))
          .run();
      } catch {
        void 0;
      }
    }
  }
  return stats;
}

function startCampaign(db: PushDb, campaign: CampaignRow, nowIso: string): { queued: number; skipped: number } {
  // Atomic claim: only the worker that flips scheduled→sending may enqueue.
  // Two workers sharing the SQLite file would otherwise both resolve the
  // audience and insert duplicate deliveries for every subscriber.
  const claimed = db
    .update(campaigns)
    .set({ status: "sending" })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "scheduled")))
    .run();
  if (claimed.changes === 0) return { queued: 0, skipped: 1 };

  if (!campaign.domain_id) {
    db.update(campaigns)
      .set({ status: "failed" })
      .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "sending")))
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
    });
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
 * - `{ kind: "non_clickers", source_campaign_id }` — recipients of the source
 *   campaign whose delivery was sent but never clicked (resend flow)
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
  // Retargeting: everyone who RECEIVED the source campaign but never clicked
  // it — powers one-click "resend to non-clickers" from the campaign page.
  if (kind === "non_clickers") {
    let sourceCampaignId: number | undefined;
    try {
      const parsed2 = campaign.audience_json ? (JSON.parse(campaign.audience_json) as { source_campaign_id?: number }) : {};
      if (Number.isInteger(parsed2.source_campaign_id) && (parsed2.source_campaign_id ?? 0) > 0) {
        sourceCampaignId = parsed2.source_campaign_id;
      }
    } catch {
      void 0;
    }
    if (!sourceCampaignId) return [];
    const rows = db
      .select({ id: subscribers.id })
      .from(deliveries)
      .innerJoin(subscribers, eq(subscribers.id, deliveries.subscriber_id))
      .leftJoin(events, and(eq(events.delivery_id, deliveries.id), eq(events.type, "clicked")))
      .where(
        and(
          eq(deliveries.campaign_id, sourceCampaignId),
          eq(deliveries.status, "sent"),
          isNull(subscribers.unsubscribed_at),
          eq(subscribers.domain_id, domainId),
          isNull(events.id),
        ),
      )
      .all();
    return rows.map((r) => r.id);
  }
  if (kind === "manual") {
    if (!ids || ids.length === 0) return [];
    // Chunk the id list: SQLite's host-parameter limit (~32k) would throw on
    // a large manual audience (e.g. CSV import) — chunked OR-joined IN lists
    // keep the same semantics without hitting the limit.
    const CHUNK = 500;
    const rows: { id: number }[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      rows.push(
        ...db
          .select({ id: subscribers.id })
          .from(subscribers)
          .where(and(inArray(subscribers.id, slice), eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
          .all(),
      );
    }
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
  // Math.imul keeps the multiply in int32 — plain * overflows float precision
  // past 2^53 and skews distribution for large subscriber ids.
  let h = Math.imul(subscriberId, 2654435761) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  const r = h % total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (r < acc) return v.key;
  }
  return variants[0]!.key;
}
