import { and, eq, isNull, sql } from "drizzle-orm";
import { campaigns, deliveries, domains, resolveSegment, subscribers, type BetterSQLite3Database } from "@pushpanel/db";
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

  db.transaction((tx) => {
    for (const subscriberId of audience) {
      tx.insert(deliveries)
        .values({ campaign_id: campaign.id, subscriber_id: subscriberId, domain_id: campaign.domain_id! })
        .run();
    }
    tx.update(campaigns)
      .set({ status: "sending" })
      .where(eq(campaigns.id, campaign.id))
      .run();
  });

  return { queued: audience.length, skipped: 0 };
}

/** M2: `{ kind: 'all' }`. M5+: segments/manual lists via kind: 'segment'. */
function resolveAudience(db: PushDb, campaign: CampaignRow, domainId: number): number[] {
  let kind = "all";
  let segmentId: number | undefined;
  try {
    const parsed = campaign.audience_json ? JSON.parse(campaign.audience_json) : {};
    kind = parsed.kind ?? "all";
    segmentId = parsed.segment_id;
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
  if (kind !== "all") return [];

  const rows = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .innerJoin(domains, eq(domains.id, subscribers.domain_id))
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();
  return rows.map((r) => r.id);
}
