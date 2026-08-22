import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { campaigns, deliveries, subscribers } from "../schema";
import { automations, automationRuns } from "../schema/marketing";
import type { allTables } from "../schema";

export type PushDb = BetterSQLite3Database<typeof allTables>;

export interface AutomationPayload {
  title: string;
  message?: string | null;
  icon_url?: string | null;
  image_url?: string | null;
  launch_url?: string | null;
}

export interface EnqueueAutomationOptions {
  db: PushDb;
  workspaceId: number;
  domainId: number;
  automationId: number;
  /** Falls back to the automation's config payload */
  payload?: AutomationPayload;
  delaySeconds?: number;
  /** NULL/undefined = every active subscriber of the domain */
  subscriberIds?: number[];
  now?: Date;
}

export interface EnqueueResult {
  campaignId: number;
  /** deliveries written immediately (delayed runs are enqueued by the scheduler) */
  queued: number;
  /** audience size deferred to the scheduler for delayed campaigns */
  delayed: number;
}

/**
 * Automation dispatch: creates a campaign (source = automation) and queues
 * deliveries. Immediate runs become `sending` campaigns with `queued` rows;
 * `delaySeconds > 0` produces a `scheduled` campaign the worker scheduler
 * starts later. Shared by the web welcome-push hook and the worker runner.
 */
export function enqueueAutomationCampaign(opts: EnqueueAutomationOptions): EnqueueResult {
  const db = opts.db;
  const now = opts.now ?? new Date();
  const config = readAutomationConfig(db, opts.automationId);
  const base = config?.payload ?? {};
  const payload: AutomationPayload = {
    title: opts.payload?.title ?? base.title ?? "",
    message: opts.payload?.message ?? base.message,
    icon_url: opts.payload?.icon_url ?? base.icon_url,
    image_url: opts.payload?.image_url ?? base.image_url,
    launch_url: opts.payload?.launch_url ?? base.launch_url,
  };
  const delaySeconds = opts.delaySeconds ?? config?.delay_seconds ?? 0;

  const delayed = delaySeconds > 0;
  const values: typeof campaigns.$inferInsert = {
    workspace_id: opts.workspaceId,
    domain_id: opts.domainId,
    title: payload.title,
    message: payload.message || null,
    icon_url: payload.icon_url || null,
    image_url: payload.image_url || null,
    launch_url: payload.launch_url || null,
    audience_json: JSON.stringify(
      opts.subscriberIds ? { kind: "manual", ids: opts.subscriberIds } : { kind: "all" },
    ),
    source: "automation",
    status: delayed ? "scheduled" : "sending",
    scheduled: delayed ? 1 : 0,
  };
  if (delayed) values.schedule_at = new Date(now.getTime() + delaySeconds * 1000).toISOString();

  let subscriberIds = opts.subscriberIds;
  if (subscriberIds === undefined) subscriberIds = activeSubscriberIds(db, opts.domainId);

  return db.transaction((tx) => {
    const inserted = tx.insert(campaigns).values(values).run();
    const campaignId = Number(inserted.lastInsertRowid);
    if (delayed) return { campaignId, queued: 0, delayed: subscriberIds.length };
    if (subscriberIds.length === 0) {
      // Empty audience: finish immediately. A `sending` campaign with zero
      // deliveries would never be finalized (nothing transitions it), so it
      // would sit "sending" forever.
      tx.update(campaigns)
        .set({ status: "done", sent_at: now.toISOString() })
        .where(eq(campaigns.id, campaignId))
        .run();
      return { campaignId, queued: 0, delayed: 0 };
    }
    for (const subscriberId of subscriberIds) {
      tx.insert(deliveries)
        .values({ campaign_id: campaignId, subscriber_id: subscriberId, domain_id: opts.domainId, requested_at: now.getTime() })
        .run();
    }
    return { campaignId, queued: subscriberIds.length, delayed: 0 };
  });
}

/** All active (never unsubscribed) subscriber ids of a domain, oldest first. */
export function activeSubscriberIds(db: PushDb, domainId: number): number[] {
  const rows = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .orderBy(subscribers.id)
    .all();
  return rows.map((r) => r.id);
}

/** Per-run log row (observability). */
export function recordAutomationRun(db: PushDb, automationId: number, status: "ok" | "error", detail?: string): void {
  db.insert(automationRuns)
    .values({ automation_id: automationId, status, detail: detail ?? null })
    .run();
}

interface AutomationConfigRow {
  payload?: { title?: string; message?: string; icon_url?: string; image_url?: string; launch_url?: string };
  delay_seconds?: number;
  secret?: string;
}

function readAutomationConfig(db: PushDb, automationId: number): AutomationConfigRow | null {
  const [row] = db.select({ config_json: automations.config_json }).from(automations).where(eq(automations.id, automationId)).limit(1).all();
  if (!row) return null;
  try {
    return JSON.parse(row.config_json ?? "{}") as AutomationConfigRow;
  } catch {
    return null;
  }
}