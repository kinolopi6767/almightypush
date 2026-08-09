import { and, eq, isNotNull, lt } from "drizzle-orm";
import { settings, subscribers } from "@pushpanel/db/schema";
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

  writeSetting(db, "last_cleanup_at", now.toISOString());
  return { deleted: result.changes, ran: true };
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
