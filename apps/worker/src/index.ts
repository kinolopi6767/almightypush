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
/**
 * Max time to wait for an in-flight tick on SIGTERM before force-exit.
 * Tunable so Docker's stop_grace_period and a large WORKER_BATCH_SIZE can be
 * matched; the stale-claim reviver is the safety net for anything cut short.
 */
const GRACE_EXIT_MS = envMs("WORKER_GRACE_EXIT_MS", 35_000);
/** Liveness heartbeat cadence — beats *during* a long tick, not just between. */
const HEARTBEAT_MS = envMs("WORKER_HEARTBEAT_MS", 10_000);
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
  try {
    const appUrl = new URL(process.env.APP_URL);
    if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
      throw new Error("APP_URL must be http(s)");
    }
    if (appUrl.username || appUrl.password) throw new Error("APP_URL must not contain credentials");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("APP_URL")) throw e;
    throw new Error("APP_URL is invalid — must be an absolute http(s) URL");
  }

  // Without the encryption key every queued delivery would be marked failed
  // (token decrypt) — burning the whole queue terminally instead of failing
  // fast at boot. The shared env schema only enforces this in production, so
  // guard here for dev/staging too.
  if (!env.APP_ENC_KEY || !/^[0-9a-f]{64}$/i.test(env.APP_ENC_KEY)) {
    throw new Error("APP_ENC_KEY is required (64 hex chars) — worker cannot decrypt push tokens without it");
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

  // Per-stage isolation: one throwing stage (locked DB in scheduler, corrupt
  // automation row, disk-full backup) must NEVER starve the other stages for
  // the whole tick. Each stage gets its own try/catch + timing.
  const runStage = async <T>(name: string, fn: () => T | Promise<T>): Promise<T | null> => {
    const start = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - start;
      if (ms > 5000) logger.warn({ stage: name, ms }, "slow worker stage");
      return result;
    } catch (error) {
      logger.error({ stage: name, err: error }, "worker stage failed");
      return null;
    }
  };

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      reopenDbIfReplaced();
      const sched = (await runStage("scheduler", () => runScheduler(db))) ?? { campaignsStarted: 0, queued: 0, skipped: 0 };
      if (sched.campaignsStarted > 0) {
        logger.info({ ...sched }, "scheduler started campaigns");
      }
      const auto = (await runStage("automations", () => runAutomations(db))) ?? { ran: 0, ok: 0, failed: 0, campaigns: 0 };
      if (auto.ran > 0) {
        logger.info({ ...auto }, "automations ran");
      }
      const journey = (await runStage("journeys", () => runJourneys(db))) ?? { ran: 0 };
      if (journey.ran > 0) {
        logger.info({ ...journey }, "journeys ran");
      }
      const email = (await runStage("email", () => runEmailCampaigns(db))) ?? { started: 0, sent: 0, resolved: 0 };
      if (email.started > 0) {
        logger.info({ ...email }, "email campaigns ran");
      }
      const stats = (await runStage("send", () => runSendCycle(db, env.APP_ENC_KEY))) ?? { claimed: 0 };
      if (stats.claimed > 0) {
        logger.info({ ...stats }, "send cycle complete");
      }
      // Default 30 matches the settings form's displayed default (`?? "30"`
      // in settings/page.tsx) — see effectiveUnsubRetentionDays.
      const retention = effectiveUnsubRetentionDays(readSetting(db, "cleanup_unsubs_retention_days"));
      let cleaned = 0;
      if (retention > 0) {
        const cleanup = (await runStage("cleanup", () => runCleanup(db, { retentionDays: retention }))) ?? { ran: false, deleted: 0 };
        cleaned = cleanup.deleted;
        if (cleanup.ran && cleanup.deleted > 0) {
          logger.info({ deleted: cleanup.deleted }, "cleanup purged unsubscribed subscribers");
        }
      }
      const backupMade = (await runStage("backup", () => runBackupScheduler(db, path))) ?? false;
      if (backupMade) logger.info({ interval: readSetting(db, "backup_auto_interval") }, "auto backup snapshot created");
      const pruned = (await runStage("retention", () => runRetentionPruning(db, new Date(), logger))) ?? { deliveries: 0, events: 0 };
      if (pruned.deliveries > 0 || pruned.events > 0) logger.info(pruned, "retention pruning");
      traceActive = sched.campaignsStarted > 0 || auto.ran > 0 || journey.ran > 0 || email.started > 0 || stats.claimed > 0 || cleaned > 0 || pruned.deliveries > 0 || pruned.events > 0 || backupMade;
    } catch (error) {
      logger.error({ err: error }, "tick failed");
    } finally {
      running = false;
    }
  };

  // Liveness heartbeat: compose healthcheck reads this file's mtime — a hung
  // (not exited) worker is otherwise never restarted. Beat on a timer during
  // ticks too: a legitimately long send cycle previously looked dead.
  const heartbeatPath = nodePath.join(nodePath.dirname(path), "worker-heartbeat");
  const beat = () => {
    try {
      writeFileSync(heartbeatPath, new Date().toISOString());
    } catch {
      /* best-effort — read-only volumes etc. */
    }
  };
  beat();
  // unref: must not keep the process alive on its own (the tick timer does).
  const heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  const loop = () => {
    if (shuttingDown) return;
    beat();
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
    clearInterval(heartbeatTimer);
    const force = setTimeout(() => process.exit(0), GRACE_EXIT_MS);
    force.unref?.();
    void (pendingTick ?? Promise.resolve()).finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Crash visibility: an unhandled rejection would otherwise kill the process
  // silently (or leave it hung). Log and exit so the orchestrator restarts.
  process.on("unhandledRejection", (reason) => {
    try {
      logger.error({ err: reason }, "unhandled rejection — exiting");
    } finally {
      process.exit(1);
    }
  });
  process.on("uncaughtException", (err) => {
    try {
      logger.error({ err }, "uncaught exception — exiting");
    } finally {
      process.exit(1);
    }
  });
}

main();
