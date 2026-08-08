import "dotenv/config";

import { sql } from "drizzle-orm";
import { pino } from "pino";
import { createDb, resolveDbPath } from "@pushpanel/db";
import { baseEnvSchema, parseEnv } from "@pushpanel/core";

/**
 * Background worker process: sender + scheduler + automation + cleanup.
 * M0 skeleton — the worker boots, verifies the DB, and idles while the
 * queue tables wait for M1's sender engine.
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

  if (env.NODE_ENV !== "production") {
    logger.warn("worker running in development mode");
  }
  // M1: sender engine, scheduler tick loop, automation dispatch, cleanup job.
  logger.info("worker idle — queue engines land in M1");

  const shutdown = () => {
    logger.info("worker shutting down");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();