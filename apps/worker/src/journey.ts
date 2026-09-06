import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { journeys, journeyRuns } from "@pushpanel/db/schema";
import type { allTables } from "@pushpanel/db";

type PushDb = BetterSQLite3Database<typeof allTables>;

export interface JourneyStats {
  ran: number;
  ok: number;
  failed: number;
}

/**
 * LumaPush Journeys — visual canvas stub.
 * Picks active journeys where next_run_at <= now, records a run, re-arms via interval.
 * Full canvas execution (branch/wait/email) is deferred — this keeps the worker green while
 * the UI can create/edit journeys.
 */
export async function runJourneys(db: PushDb, now: Date = new Date()): Promise<JourneyStats> {
  const stats: JourneyStats = { ran: 0, ok: 0, failed: 0 };
  const nowIso = now.toISOString();
  const rows = db
    .select({ id: journeys.id, workspace_id: journeys.workspace_id, trigger_type: journeys.trigger_type, canvas_json: journeys.canvas_json, next_run_at: journeys.next_run_at })
    .from(journeys)
    .where(and(eq(journeys.status, "active"), sql`${journeys.next_run_at} IS NOT NULL AND ${journeys.next_run_at} <= ${nowIso}`))
    .all();

  for (const row of rows) {
    // Same multi-worker claim discipline as automations/scheduler: advance
    // next_run_at in the claim itself so a concurrent worker's WHERE on the
    // old value matches zero rows (no duplicate journey runs).
    const claimSentinel = new Date(now.getTime() + 5 * 60_000).toISOString();
    const claimed = db
      .update(journeys)
      .set({ last_run_at: nowIso, next_run_at: claimSentinel })
      .where(and(eq(journeys.id, row.id), eq(journeys.status, "active"), eq(journeys.next_run_at, row.next_run_at ?? "")))
      .run();
    if (claimed.changes === 0) continue;
    try {
      // Minimal: log a run, re-arm 15min later
      db.insert(journeyRuns).values({ journey_id: row.id, status: "sent", detail: `canvas ${row.canvas_json.slice(0, 80)}` }).run();
      db.update(journeys)
        .set({ last_run_at: nowIso, next_run_at: new Date(now.getTime() + 15 * 60_000).toISOString() })
        .where(eq(journeys.id, row.id))
        .run();
      stats.ran++;
      stats.ok++;
    } catch {
      stats.ran++;
      stats.failed++;
      // Back off failures — otherwise a persistently failing journey is
      // retried every tick (as fast as the worker's tick interval).
      try {
        db.update(journeys)
          .set({ next_run_at: new Date(now.getTime() + 3 * 60_000).toISOString() })
          .where(eq(journeys.id, row.id))
          .run();
      } catch {
        void 0;
      }
    }
  }
  return stats;
}
