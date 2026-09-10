import { and, count, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { campaigns, deliveries, domains, subscribers } from "../schema";
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
  // Cross-tenant guard: the domain MUST belong to the calling workspace.
  // Without this, mismatched caller args create cross-workspace campaigns and
  // push to someone else's subscribers. Fail-closed (throw) — never send.
  const [domain] = db
    .select({ id: domains.id, workspace_id: domains.workspace_id })
    .from(domains)
    .where(eq(domains.id, opts.domainId))
    .limit(1)
    .all();
  if (!domain || domain.workspace_id !== opts.workspaceId) {
    throw new Error("Domain does not belong to workspace");
  }
  // Automation row must also belong to the workspace (unscoped reads could
  // otherwise pull another tenant's payload/secret).
  const [autoRow] = db
    .select({ id: automations.id })
    .from(automations)
    .where(and(eq(automations.id, opts.automationId), eq(automations.workspace_id, opts.workspaceId)))
    .limit(1)
    .all();
  if (!autoRow) throw new Error("Automation does not belong to workspace");
  const config = readAutomationConfig(db, opts.automationId, opts.workspaceId);
  const base = config?.payload ?? {};
  const rawTitle = opts.payload?.title ?? base.title ?? "";
  // Fail-closed: a corrupt config (or missing title) must NEVER degrade to a
  // sendable "New update" default push. Throw so the caller skips the run.
  if (typeof rawTitle !== "string" || rawTitle.trim().length === 0) {
    throw new Error("Automation payload has no title — refusing to send");
  }
  const payload: AutomationPayload = {
    title: rawTitle.trim().slice(0, 200),
    message: (opts.payload?.message ?? base.message ?? null) as string | null,
    icon_url: (opts.payload?.icon_url ?? base.icon_url ?? null) as string | null,
    image_url: (opts.payload?.image_url ?? base.image_url ?? null) as string | null,
    launch_url: (opts.payload?.launch_url ?? base.launch_url ?? null) as string | null,
  };
  const delaySeconds = opts.delaySeconds ?? config?.delay_seconds ?? 0;

  const delayed = delaySeconds > 0;

  // Resolve/scope the audience BEFORE the campaign row is written. The
  // previous order stored the raw caller id list in audience_json (including
  // ids of other domains) and only scoped what it enqueued — any other
  // consumer trusting audience_json could cross tenants.
  let subscriberIds = opts.subscriberIds;
  if (subscriberIds === undefined) {
    // Delayed "all" campaigns are re-resolved by the scheduler, so loading
    // every id here is pure waste (and an OOM risk at 1M subscribers).
    if (!delayed) subscriberIds = activeSubscriberIds(db, opts.domainId);
  } else {
    // Scope caller-supplied IDs to the domain: filter out ids that are not
    // active subscribers of THIS domain (prevents cross-tenant delivery when
    // a stale/forged id list is passed).
    subscriberIds = scopeSubscriberIdsToDomain(db, opts.domainId, subscriberIds);
  }

  const values: typeof campaigns.$inferInsert = {
    workspace_id: opts.workspaceId,
    domain_id: opts.domainId,
    title: payload.title,
    message: payload.message || null,
    icon_url: payload.icon_url || null,
    image_url: payload.image_url || null,
    launch_url: payload.launch_url || null,
    audience_json:
      subscriberIds === undefined
        ? JSON.stringify({ kind: "all" })
        : JSON.stringify({ kind: "manual", ids: subscriberIds }),
    source: "automation",
    status: delayed ? "scheduled" : "sending",
    scheduled: delayed ? 1 : 0,
    // Immediate runs fan out below and are complete on return; delayed runs
    // are enqueued by the scheduler, which sets the flag after its fan-out.
    audience_complete: delayed ? 0 : 1,
  };
  if (delayed) values.schedule_at = new Date(now.getTime() + delaySeconds * 1000).toISOString();

  // Campaign row + delivery inserts. Deliveries are written in bounded
  // chunks (mirroring the scheduler) instead of one transaction over the
  // whole audience — a single multi-minute transaction would hold SQLite's
  // write lock and starve the web process with SQLITE_BUSY.
  const CHUNK = 500;
  const inserted = db.insert(campaigns).values(values).run();
  const campaignId = Number(inserted.lastInsertRowid);
  if (delayed) {
    const audienceSize = subscriberIds?.length ?? countActiveSubscribers(db, opts.domainId);
    return { campaignId, queued: 0, delayed: audienceSize };
  }
  if (!subscriberIds || subscriberIds.length === 0) {
    // Empty audience: finish immediately. A `sending` campaign with zero
    // deliveries would never be finalized (nothing transitions it), so it
    // would sit "sending" forever.
    db.update(campaigns)
      .set({ status: "done", sent_at: now.toISOString() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")))
      .run();
    return { campaignId, queued: 0, delayed: 0 };
  }
  let queued = 0;
  try {
    for (let i = 0; i < subscriberIds.length; i += CHUNK) {
      const chunk = subscriberIds.slice(i, i + CHUNK);
      // ON CONFLICT DO NOTHING + UNIQUE(campaign_id, subscriber_id) makes a
      // retried fan-out idempotent instead of double-pushing. `changes` is
      // the true insert count (dedupe-aware).
      const changes = db.transaction((tx) =>
        tx
          .insert(deliveries)
          .values(
            chunk.map((subscriberId) => ({
              campaign_id: campaignId,
              subscriber_id: subscriberId,
              domain_id: opts.domainId,
              requested_at: now.getTime(),
            })),
          )
          .onConflictDoNothing()
          .run().changes,
      );
      queued += changes;
    }
  } catch (error) {
    // A partial fan-out must not leave a `sending` campaign that the reaper
    // later finalizes as if it were complete. Mark it failed, then surface
    // the error so the caller can retry with a fresh campaign.
    db.update(campaigns)
      .set({ status: "failed", sent_at: now.toISOString() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "sending")))
      .run();
    throw error;
  }
  return { campaignId, queued, delayed: 0 };
}

/** All active (never unsubscribed) subscriber ids of a domain, oldest first. */
export function activeSubscriberIds(db: PushDb, domainId: number, opts: { limit?: number; offset?: number } = {}): number[] {
  const limit = opts.limit !== undefined ? Math.min(Math.max(Math.floor(opts.limit), 1), 5000) : undefined;
  const offset = opts.offset !== undefined ? Math.max(Math.floor(opts.offset), 0) : undefined;
  const base = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .orderBy(subscribers.id);
  const rows = (limit !== undefined ? base.limit(limit).offset(offset ?? 0) : base).all();
  return rows.map((r) => r.id);
}

/** Count active subscribers without loading ids (OOM-safe guard for fan-out). */
export function countActiveSubscribers(db: PushDb, domainId: number): number {
  const [row] = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .limit(1)
    .all();
  return row?.value ?? 0;
}

/** Filter an explicit id list to active subscribers of the domain (chunked). */
export function scopeSubscriberIdsToDomain(db: PushDb, domainId: number, ids: number[]): number[] {
  const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && (id as number) > 0))];
  if (clean.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 500) {
    const slice = clean.slice(i, i + 500);
    const rows = db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(and(inArray(subscribers.id, slice), eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
      .all();
    for (const r of rows) out.push(r.id);
  }
  return out;
}

/** Per-run log row (observability). */
export function recordAutomationRun(db: PushDb, automationId: number, status: "ok" | "error", detail?: string): void {
  // Truncate: exception stacks / feed bodies would otherwise bloat the DB.
  const safe = typeof detail === "string" && detail.length > 2000 ? detail.slice(0, 2000) : (detail ?? null);
  db.insert(automationRuns)
    .values({ automation_id: automationId, status, detail: safe })
    .run();
}

interface AutomationConfigRow {
  payload?: { title?: string; message?: string; icon_url?: string; image_url?: string; launch_url?: string };
  delay_seconds?: number;
  secret?: string;
}

function readAutomationConfig(db: PushDb, automationId: number, workspaceId?: number): AutomationConfigRow | null {
  // Workspace scoping is REQUIRED at this layer (not optional): an unscoped
  // read could pull another tenant's payload into a campaign.
  if (workspaceId === undefined) return null;
  const where = and(eq(automations.id, automationId), eq(automations.workspace_id, workspaceId));
  const [row] = db.select({ config_json: automations.config_json }).from(automations).where(where).limit(1).all();
  if (!row) return null;
  try {
    return JSON.parse(row.config_json ?? "{}") as AutomationConfigRow;
  } catch {
    return null;
  }
}