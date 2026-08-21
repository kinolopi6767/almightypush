import { and, count, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { deliveries, domains, events, settings, subscribers } from "@pushpanel/db/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { allTables } from "@pushpanel/db";

const CLEANUP_HOUR_MS = 3_600_000;

/**
 * Housekeeping job: purge unsubscribed subscribers after a retention window.
 * Runs at most once per hour (guarded by a settings marker) so the tick stays
 * cheap. retentionDays 0 (or unset) disables the job.
 */
export function runCleanup(
  db: BetterSQLite3Database<typeof allTables>,
  opts: { now?: Date; retentionDays: number; lastRunAt?: string | null } = { retentionDays: 0 },
): { deleted: number; ran: boolean } {
  const now = opts.now ?? new Date();

  if ((opts.retentionDays ?? 0) <= 0) return { deleted: 0, ran: false };

  // Hourly guard — the marker lives in settings (shared key namespace is fine
  // for a single-writer SQLite file).
  const lastRunAt = opts.lastRunAt ?? readSetting(db, "last_cleanup_at");
  if (lastRunAt && now.getTime() - new Date(lastRunAt).getTime() < CLEANUP_HOUR_MS) {
    return { deleted: 0, ran: false };
  }

  const cutoff = new Date(now.getTime() - opts.retentionDays * 86_400_000).toISOString();
  const result = db
    .delete(subscribers)
    .where(and(isNotNull(subscribers.unsubscribed_at), lt(subscribers.unsubscribed_at, cutoff)))
    .run();

  if (result.changes > 0) {
    // The purge bypassed the per-subscriber paths that maintain
    // domains.subscribers_count — recompute it for every domain.
    recomputeSubscriberCounts(db);
  }

  writeSetting(db, "last_cleanup_at", now.toISOString());
  return { deleted: result.changes, ran: true };
}

/** Refresh domains.subscribers_count from the active-subscriber ground truth. */
function recomputeSubscriberCounts(db: BetterSQLite3Database<typeof allTables>): void {
  const counts = db
    .select({ domain_id: subscribers.domain_id, value: count() })
    .from(subscribers)
    .where(isNull(subscribers.unsubscribed_at))
    .groupBy(subscribers.domain_id)
    .all();
  const map = new Map(counts.map((c) => [c.domain_id, c.value]));
  for (const domain of db.select({ id: domains.id }).from(domains).all()) {
    db.update(domains)
      .set({ subscribers_count: map.get(domain.id) ?? 0 })
      .where(eq(domains.id, domain.id))
      .run();
  }
}

/**
 * 1M scale: prune old deliveries/events to keep SQLite file <10GB.
 * Runs daily (guarded by last_prune_at). Default 7d deliveries, 30d events — tunable.
 * 1 campaign/day * 1M = 30M rows/month ~4GB. Prune after 7d keeps ~7GB.
 */
export function runRetentionPruning(db: BetterSQLite3Database<typeof allTables>, now: Date = new Date()): { deliveries: number; events: number } {
  const lastPrune = readSetting(db, "last_prune_at");
  if (lastPrune && now.getTime() - new Date(lastPrune).getTime() < 24 * 60 * 60 * 1000) return { deliveries: 0, events: 0 };

  const delDays = Number(readSetting(db, "retention_deliveries_days") ?? process.env.RETENTION_DELIVERIES_DAYS ?? 7);
  const evtDays = Number(readSetting(db, "retention_events_days") ?? process.env.RETENTION_EVENTS_DAYS ?? 30);
  let prunedDel = 0;
  let prunedEvt = 0;

  if (delDays > 0) {
    const cutoff = now.getTime() - delDays * 86_400_000;
    try {
      const res = db.delete(deliveries).where(and(inArray(deliveries.status, ["sent", "failed", "cancelled", "unsubscribed"]), isNotNull(deliveries.sent_at), lt(deliveries.sent_at, cutoff))).run();
      prunedDel = res.changes;
    } catch {
      void 0;
    }
  }
  if (evtDays > 0) {
    const cutoffIso = new Date(now.getTime() - evtDays * 86_400_000).toISOString();
    try {
      const res = db.delete(events).where(lt(events.ts, cutoffIso)).run();
      prunedEvt = res.changes;
    } catch {
      void 0;
    }
  }
  writeSetting(db, "last_prune_at", now.toISOString());
  return { deliveries: prunedDel, events: prunedEvt };
}

export function readSetting(db: BetterSQLite3Database<typeof allTables>, key: string): string | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function writeSetting(
  db: BetterSQLite3Database<typeof allTables>,
  key: string,
  value: string,
): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
