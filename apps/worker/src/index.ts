import "dotenv/config";

import { sql } from "drizzle-orm";
import { pino } from "pino";
import { createDb, resolveDbPath } from "@pushpanel/db";
import { baseEnvSchema, parseEnv } from "@pushpanel/core";
import { runSendCycle } from "./sender";
import { runScheduler } from "./scheduler";
import { runAutomations } from "./automation";
import { runBackupScheduler } from "./backup";
import { runJourneys } from "./journey";
import { runEmailCampaigns } from "./email";
import { readSetting, runCleanup, runRetentionPruning } from "./cleanup";
import { nextPollMs } from "./poll";

/** Env-number parse with fallback + clamp — NaN/garbage must not hot-loop. */
function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(Math.floor(raw), 100);
}

const WORK_MS = envMs("WORKER_TICK_MS", 5_000);
const IDLE_MS = envMs("WORKER_IDLE_TICK_MS", 60_000);
/** Max seconds to wait for an in-flight tick on SIGTERM before force-exit. */
const GRACE_EXIT_MS = 35_000;
let running = false;
let traceActive = false;
let shuttingDown = false;
let pendingTick: Promise<void> | null = null;

/**
 * Background worker process: sender engine (M1) + scheduler (M2) + more later.
 * Every tick: start due scheduled campaigns, then run one send cycle against
 * the shared SQLite file. Cadence is adaptive — fast while there is work,
 * a 60s idle poll when the system is quiet (m9).
 */
function main() {
  const env = parseEnv(baseEnvSchema);
  const logger = pino({ level: env.NODE_ENV === "test" ? "silent" : "info" });
  logger.info({ node: process.version, pid: process.pid }, "PushPanel worker starting");

  const path = resolveDbPath(env.DATABASE_PATH);
  if (path === ":memory:") {
    throw new Error("Worker cannot run against :memory: database");
  }
  const db = createDb(path, { migrate: true });
  const probe = db.get<{ ok: number }>(sql`SELECT 1 AS ok`);
  logger.info({ path, dbOk: probe?.ok === 1 }, "database open");

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sched = runScheduler(db);
      if (sched.campaignsStarted > 0) {
        logger.info({ ...sched }, "scheduler started campaigns");
      }
      const auto = await runAutomations(db);
      if (auto.ran > 0) {
        logger.info({ ...auto }, "automations ran");
      }
      const journey = await runJourneys(db);
      if (journey.ran > 0) {
        logger.info({ ...journey }, "journeys ran");
      }
      const email = runEmailCampaigns(db);
      if (email.started > 0) {
        logger.info({ ...email }, "email campaigns ran");
      }
      const stats = await runSendCycle(db, env.APP_ENC_KEY);
      if (stats.claimed > 0) {
        logger.info({ ...stats }, "send cycle complete");
      }
      const retention = Number(readSetting(db, "cleanup_unsubs_retention_days") ?? 0);
      let cleaned = 0;
      if (retention > 0) {
        const cleanup = runCleanup(db, { retentionDays: retention });
        cleaned = cleanup.deleted;
        if (cleanup.ran && cleanup.deleted > 0) {
          logger.info({ deleted: cleanup.deleted }, "cleanup purged unsubscribed subscribers");
        }
      }
      const backupMade = runBackupScheduler(db, path);
      if (backupMade) logger.info({ interval: readSetting(db, "backup_auto_interval") }, "auto backup snapshot created");
      const pruned = runRetentionPruning(db, new Date(), logger);
      if (pruned.deliveries > 0 || pruned.events > 0) logger.info(pruned, "retention pruning");
      traceActive = sched.campaignsStarted > 0 || auto.ran > 0 || journey.ran > 0 || stats.claimed > 0 || cleaned > 0 || pruned.deliveries > 0;
    } catch (error) {
      logger.error({ err: error }, "tick failed");
    } finally {
      running = false;
    }
  };

  const loop = () => {
    if (shuttingDown) return;
    const timer = setTimeout(() => {
      pendingTick = tick()
        .catch(() => undefined) // tick already logs its own errors; never let the chain die
        .finally(loop);
    }, nextPollMs(traceActive, WORK_MS, IDLE_MS));
    timer.unref?.();
  };
  pendingTick = tick().finally(loop);

  // Graceful shutdown: stop scheduling new ticks and let the in-flight tick
  // finish (bounded — sends have a 30s provider timeout) instead of killing
  // mid-request. Killed in-flight sends would otherwise sit `sending` for the
  // full stale-claim window (10 min) after every deploy/restart.
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker shutting down");
    const force = setTimeout(() => process.exit(0), GRACE_EXIT_MS);
    force.unref?.();
    void (pendingTick ?? Promise.resolve()).finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
