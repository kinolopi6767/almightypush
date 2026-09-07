import "dotenv/config";

import { existsSync, unlinkSync } from "node:fs";
import { writeFileSync } from "node:fs";
import nodePath from "node:path";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import { createDb, resolveDbPath, DB_REPLACED_MARKER } from "@pushpanel/db";
import { baseEnvSchema, parseEnv } from "@pushpanel/core";
import { runSendCycle } from "./sender";
import { runScheduler } from "./scheduler";
import { runAutomations } from "./automation";
import { runBackupScheduler } from "./backup";
import { runJourneys } from "./journey";
import { runEmailCampaigns } from "./email";
import { effectiveUnsubRetentionDays, readSetting, runCleanup, runRetentionPruning } from "./cleanup";
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

  // Click-attribution beacons embed this origin into every push payload.
  // Without it, clicks can never be attributed (the SW would have to guess
  // the panel origin) — refuse to run rather than send unattributable pushes.
  if (!process.env.APP_URL) {
    throw new Error("APP_URL is required — push payloads embed it as the click-beacon origin");
  }

  const path = resolveDbPath(env.DATABASE_PATH);
  if (path === ":memory:") {
    throw new Error("Worker cannot run against :memory: database");
  }
  let db = createDb(path, { migrate: true });
  const probe = db.get<{ ok: number }>(sql`SELECT 1 AS ok`);
  logger.info({ path, dbOk: probe?.ok === 1 }, "database open");

  // Restore-swap healing: the panel's restore action replaces the DB file
  // from the web process and drops a marker — this worker's open connection
  // still reads the OLD file (SQLite page cache). Reopen instead of serving
  // stale data or writing through a swapped file (corruption risk).
  const markerPath = nodePath.join(nodePath.dirname(path), DB_REPLACED_MARKER);
  const reopenDbIfReplaced = (): void => {
    let replaced = false;
    try {
      replaced = existsSync(markerPath);
    } catch {
      replaced = false;
    }
    if (!replaced) return;
    try {
      unlinkSync(markerPath);
    } catch {
      // another tick already consumed it — still reopen, cheap and safe
    }
    try {
      (db as unknown as { $client?: { close?: () => void } }).$client?.close?.();
    } catch {
      // already closed — reopen regardless
    }
    db = createDb(path, { migrate: true });
    logger.info("database reopened after panel restore");
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      reopenDbIfReplaced();
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
      // Default 30 matches the settings form's displayed default (`?? "30"`
      // in settings/page.tsx) — see effectiveUnsubRetentionDays.
      const retention = effectiveUnsubRetentionDays(readSetting(db, "cleanup_unsubs_retention_days"));
      let cleaned = 0;
      if (retention > 0) {
        const cleanup = runCleanup(db, { retentionDays: retention });
        cleaned = cleanup.deleted;
        if (cleanup.ran && cleanup.deleted > 0) {
          logger.info({ deleted: cleanup.deleted }, "cleanup purged unsubscribed subscribers");
        }
      }
      const backupMade = await runBackupScheduler(db, path);
      if (backupMade) logger.info({ interval: readSetting(db, "backup_auto_interval") }, "auto backup snapshot created");
      const pruned = runRetentionPruning(db, new Date(), logger);
      if (pruned.deliveries > 0 || pruned.events > 0) logger.info(pruned, "retention pruning");
      traceActive = sched.campaignsStarted > 0 || auto.ran > 0 || journey.ran > 0 || email.started > 0 || stats.claimed > 0 || cleaned > 0 || pruned.deliveries > 0 || pruned.events > 0 || backupMade;
    } catch (error) {
      logger.error({ err: error }, "tick failed");
    } finally {
      running = false;
    }
  };

  const loop = () => {
    if (shuttingDown) return;
    // Liveness heartbeat: compose healthcheck reads this file's mtime — a
    // hung (not exited) worker is otherwise never restarted.
    try {
      writeFileSync(nodePath.join(nodePath.dirname(path), "worker-heartbeat"), new Date().toISOString());
    } catch {
      /* best-effort — read-only volumes etc. */
    }
    // NOTE: this timer must stay ref'd — it is the ONLY recurring handle in
    // the process. unref() here lets Node drain the loop and exit after the
    // first tick (empirically verified on Node 22).
    setTimeout(() => {
      pendingTick = tick()
        .catch(() => undefined) // tick already logs its own errors; never let the chain die
        .finally(loop);
    }, nextPollMs(traceActive, WORK_MS, IDLE_MS));
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
