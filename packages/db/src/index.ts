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

function sqliteCacheKb(): number {
  const raw = Number(process.env.SQLITE_CACHE_MB ?? 64);
  const mb = Number.isFinite(raw) ? Math.min(Math.max(raw, 4), 1024) : 64;
  return mb * 1024;
}

const DEFAULT_PRAGMAS: Record<string, string | number> = {
  journal_mode: "WAL",
  // 15s: retention pruning / backup windows hold the write lock in short
  // batches; web-side writes should wait them out instead of erroring.
  busy_timeout: 15_000,
  foreign_keys: "ON",
  synchronous: "NORMAL",
  // VPS tune: 64MB default for AWS t2.micro 1GB, 256MB for 2GB+ VPS via SQLITE_CACHE_MB env
  // Guard: garbage env must not crash boot via `cache_size = NaN`.
  cache_size: -sqliteCacheKb(),
  // Cap WAL regrowth after checkpoints (the always-writing worker +
  // pinned reader snapshots during backups would otherwise grow it unbounded).
  journal_size_limit: 134_217_728,
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
  // Pragma allowlist: keys are interpolated into `PRAGMA <key> = <value>`,
  // so caller-supplied keys must never reach the template unchecked (SQL
  // injection via pragma name). Values are numbers or single-quoted with
  // embedded quotes escaped.
  const ALLOWED_PRAGMAS = new Set([
    "journal_mode",
    "busy_timeout",
    "foreign_keys",
    "synchronous",
    "cache_size",
    "journal_size_limit",
    "wal_checkpoint",
    "temp_store",
    "mmap_size",
  ]);
  for (const [key, value] of Object.entries(pragmas)) {
    if (!ALLOWED_PRAGMAS.has(key) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const safeValue = typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
    client.pragma(`${key} = ${safeValue}`);
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

/**
 * Non-blocking consistent snapshot via better-sqlite3's backup API: pages
 * are copied in steps on the libuv pool, so the process stays responsive —
 * unlike a synchronous `VACUUM INTO`, which stalls the event loop for the
 * whole copy and pins the WAL read snapshot while sends continue.
 */
export async function backupDatabase(
  db: BetterSQLite3Database<typeof allTables>,
  target: string,
): Promise<void> {
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(target), { recursive: true });
  const client = (db as unknown as { $client: Database.Database }).$client;
  await client.backup(target);
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
    // Remember the resolved path: a second caller with a DIFFERENT path must
    // never silently get the old DB (data would go to the wrong file).
    (globalForDb as unknown as { __pushpanelDbPath?: string }).__pushpanelDbPath = resolveDbPath(path);
    return globalForDb.__pushpanelDb;
  }
  if (path !== undefined) {
    const resolved = resolveDbPath(path);
    const first = (globalForDb as unknown as { __pushpanelDbPath?: string }).__pushpanelDbPath;
    if (first !== undefined && first !== resolved) {
      throw new Error(`getDb path mismatch: initialized with ${first}, requested ${resolved}`);
    }
  }
  return globalForDb.__pushpanelDb;
}

export function setDbForTests(db?: BetterSQLite3Database<typeof allTables>): void {
  globalForDb.__pushpanelDb = db;
}

/**
 * Close the singleton connection and drop it so the next getDb() reopens
 * from disk. Used after a backup restore replaces the DB file: SQLite
 * connections cache pages/schema of the OLD file — serving or writing
 * through them after a swap risks corruption. Workers use reopenDbIfReplaced
 * (marker file) to heal without a restart.
 */
export function closeDb(): void {
  const existing = globalForDb.__pushpanelDb;
  globalForDb.__pushpanelDb = undefined;
  if (existing) {
    try {
      (existing as unknown as { $client: Database.Database }).$client.close();
    } catch {
      // already closed — the cache clear above is what matters
    }
  }
}

/** Marker filename the web restore path drops next to the DB file. */
export const DB_REPLACED_MARKER = ".db-replaced";

export { allTables };