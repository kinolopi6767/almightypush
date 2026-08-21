import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { migrations } from "./migrations-generated";
import { allTables } from "./schema";

export type { BetterSQLite3Database };
export * from "./schema";
export * from "./services/automation";
export * from "./services/segments";

export interface DbOptions {
  /** file path or ":memory:" */
  path: string;
  /** run migrations after opening */
  migrate?: boolean;
  /** sqlite pragmas to apply before returning (defaults applied unless overridden) */
  pragmas?: Record<string, string | number>;
}

const DEFAULT_PRAGMAS: Record<string, string | number> = {
  journal_mode: "WAL",
  busy_timeout: 5000,
  foreign_keys: "ON",
  synchronous: "NORMAL",
  // VPS tune: 64MB default for AWS t2.micro 1GB, 256MB for 2GB+ VPS via SQLITE_CACHE_MB env
  cache_size: -(Number(process.env.SQLITE_CACHE_MB ?? 64) * 1024),
};

/**
 * Open a better-sqlite3 connection with the PushPanel pragma profile.
 * WAL + single-writer discipline: exactly ONE exported db instance per process.
 * Readers are served from WAL snapshots and never block writers.
 */
export function createSqlite(path: string, pragmas = DEFAULT_PRAGMAS): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const client = new Database(path);
  for (const [key, value] of Object.entries(pragmas)) {
    client.pragma(`${key} = ${typeof value === "number" ? value : `'${value}'`}`);
  }
  return client;
}

/** Drizzle wrapper over an opened connection. */
export function createDb(
  path: string,
  opts?: { migrate?: boolean } & Pick<DbOptions, "pragmas">,
): BetterSQLite3Database<typeof allTables> {
  const merged = opts?.pragmas ? { ...DEFAULT_PRAGMAS, ...opts.pragmas } : DEFAULT_PRAGMAS;
  const client = createSqlite(path, merged);
  const db = drizzle(client, { schema: allTables }) as BetterSQLite3Database<typeof allTables>;
  if (opts?.migrate) {
    runMigrations(db, client);
  }
  return db;
}

/**
 * Resolve a possibly-relative DATABASE_PATH (arg or env) against the
 * monorepo root (the directory containing pnpm-workspace.yaml). In the
 * Docker image the repo root is /app, so `data/pushpanel.db` lands in the
 * persisted volume the same way it does in local dev.
 */
export function resolveDbPath(raw: string | undefined): string {
  const value = raw ?? process.env.DATABASE_PATH;
  if (!value || value === ":memory:") return value ?? "./data/pushpanel.db";
  if (isAbsolute(value)) return value;
  let dir = process.cwd();
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return resolve(dir, value);
    const parent = dirname(dir);
    if (parent === dir) return resolve(process.cwd(), value);
    dir = parent;
  }
}

/**
 * Apply migrations. Idempotent: applied tags are tracked in
 * `__pushpanel_migrations`, so repeated calls (per-test :memory: DBs,
 * multiple processes on the same file) are safe.
 *
 * Migrations are bundled TS (see scripts/sync-migrations.mjs) instead of
 * folder lookups — webpack/standalone-safe.
 */
export function runMigrations(db: BetterSQLite3Database<typeof allTables>, client: Database.Database): void {
  client.exec(`
    CREATE TABLE IF NOT EXISTS __pushpanel_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    client.prepare("SELECT tag FROM __pushpanel_migrations").all().map((row) => (row as { tag: string }).tag),
  );

  // BEGIN IMMEDIATE takes the write lock up front, so if another process
  // (web server + worker share one SQLite file) is mid-migration, this waits
  // for its commit and the re-check sees the already-applied tag instead of
  // blindly re-running CREATE TABLE and crashing on "already exists".
  for (const entry of migrations) {
    if (applied.has(entry.tag)) continue;
    client.exec("BEGIN IMMEDIATE");
    try {
      const already = client.prepare("SELECT 1 FROM __pushpanel_migrations WHERE tag = ?").get(entry.tag);
      if (already) {
        client.exec("COMMIT");
        continue;
      }
      client.exec(entry.sql);
      client
        .prepare("INSERT INTO __pushpanel_migrations (tag, applied_at) VALUES (?, ?)")
        .run(entry.tag, new Date().toISOString());
      client.exec("COMMIT");
    } catch (err) {
      client.exec("ROLLBACK");
      throw err;
    }
  }

  // WAL checkpoint so the -wal file doesn't linger on a fresh run.
  client.pragma("wal_checkpoint(TRUNCATE)");
}

/** Fresh in-memory DB with migrations applied — for tests. */
export function createMemoryDb(): { db: BetterSQLite3Database<typeof allTables>; client: Database.Database } {
  const client = createSqlite(":memory:", { ...DEFAULT_PRAGMAS, journal_mode: "MEMORY" });
  const db = drizzle(client, { schema: allTables }) as BetterSQLite3Database<typeof allTables>;
  runMigrations(db, client);
  return { db, client };
}

/**
 * Global singleton. Cached per server process so every service shares one
 * connection (single-writer discipline). Overridable for tests via
 * `setDbForTests`.
 */
const globalForDb = globalThis as unknown as { __pushpanelDb?: BetterSQLite3Database<typeof allTables> };

export function getDb(path?: string): BetterSQLite3Database<typeof allTables> {
  if (!globalForDb.__pushpanelDb) {
    globalForDb.__pushpanelDb = createDb(resolveDbPath(path), { migrate: true });
  }
  return globalForDb.__pushpanelDb;
}

export function setDbForTests(db?: BetterSQLite3Database<typeof allTables>): void {
  globalForDb.__pushpanelDb = db;
}

export { allTables };