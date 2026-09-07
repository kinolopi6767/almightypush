import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { journeys } from "@pushpanel/db/schema";
import type { allTables } from "@pushpanel/db";

type PushDb = BetterSQLite3Database<typeof allTables>;

/** Max due journeys run per tick — bounds tick time under GRACE_EXIT_MS. */
const DUE_LIMIT = 200;

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
    .select({ id: journeys.id, workspace_id: journeys.workspace_id, trigger_type: journeys.trigger_type, next_run_at: journeys.next_run_at, stats_json: journeys.stats_json })
    .from(journeys)
    .where(and(eq(journeys.status, "active"), sql`${journeys.next_run_at} IS NOT NULL AND ${journeys.next_run_at} <= ${nowIso}`))
    .orderBy(journeys.id)
    .limit(DUE_LIMIT)
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
      // Stub: canvas execution (branch/wait/email) is not implemented yet, so
      // there is deliberately NO journey_runs row here — writing status='sent'
      // rows for journeys that sent nothing would fabricate analytics history.
      // Re-arm only; the claim above already prevents concurrent double-fire.
      // Reset the consecutive-failure counter persisted in stats_json.
      let statsJson = row.stats_json ?? "{}";
      try {
        const parsed = JSON.parse(statsJson) as Record<string, unknown>;
        if (parsed.consecutiveFailures) {
          delete parsed.consecutiveFailures;
          statsJson = JSON.stringify(parsed);
        }
      } catch {
        statsJson = "{}";
      }
      db.update(journeys)
        .set({ last_run_at: nowIso, next_run_at: new Date(now.getTime() + 15 * 60_000).toISOString(), stats_json: statsJson })
        .where(eq(journeys.id, row.id))
        .run();
      stats.ran++;
      stats.ok++;
    } catch {
      stats.ran++;
      stats.failed++;
      // Back off failures — otherwise a persistently failing journey is
      // retried every tick (as fast as the worker's tick interval).
      // The counter is per-journey, persisted in stats_json (journeys have no
      // consecutive_failures column): escalating backoff 3min * 2^n capped at
      // 96min (3*2^5) with a 180min absolute ceiling, auto-pause after 10
      // consecutive failures.
      try {
        let fails = 1;
        let statsJson: string | null = null;
        try {
          const parsed = JSON.parse(row.stats_json ?? "{}") as Record<string, unknown>;
          fails = (typeof parsed.consecutiveFailures === "number" ? Math.floor(parsed.consecutiveFailures) : 0) + 1;
          parsed.consecutiveFailures = fails;
          statsJson = JSON.stringify(parsed);
        } catch {
          statsJson = JSON.stringify({ consecutiveFailures: 1 });
        }
        const backoffMin = Math.min(3 * 2 ** Math.min(fails - 1, 5), 180);
        const autoPause = fails >= 10;
        db.update(journeys)
          .set({
            next_run_at: autoPause ? null : new Date(now.getTime() + backoffMin * 60_000).toISOString(),
            status: autoPause ? "paused" : "active",
            ...(statsJson ? { stats_json: statsJson } : {}),
          })
          .where(eq(journeys.id, row.id))
          .run();
      } catch {
        void 0;
      }
    }
  }
  return stats;
}
