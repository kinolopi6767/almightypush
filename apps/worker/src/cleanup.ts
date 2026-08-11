import { and, count, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { domains, settings, subscribers } from "@pushpanel/db/schema";
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
