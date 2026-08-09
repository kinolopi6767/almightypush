import "dotenv/config";

import { sql } from "drizzle-orm";
import { pino } from "pino";
import { createDb, resolveDbPath } from "@pushpanel/db";
import { baseEnvSchema, parseEnv } from "@pushpanel/core";
import { runSendCycle } from "./sender";
import { runScheduler } from "./scheduler";
import { runAutomations } from "./automation";
import { readSetting, runCleanup } from "./cleanup";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5_000);
let running = false;

/**
 * Background worker process: sender engine (M1) + scheduler (M2) + more later.
 * Every tick: start due scheduled campaigns, then run one send cycle against
 * the shared SQLite file.
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
      const stats = await runSendCycle(db, env.APP_ENC_KEY);
      if (stats.claimed > 0) {
        logger.info({ ...stats }, "send cycle complete");
      }
      const retention = Number(readSetting(db, "cleanup_unsubs_retention_days") ?? 0);
      if (retention > 0) {
        const cleanup = runCleanup(db, { retentionDays: retention });
        if (cleanup.ran && cleanup.deleted > 0) {
          logger.info({ deleted: cleanup.deleted }, "cleanup purged unsubscribed subscribers");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  void tick();

  const shutdown = () => {
    logger.info("worker shutting down");
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
