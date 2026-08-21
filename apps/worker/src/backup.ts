import path from "node:path";
import { mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { sql } from "drizzle-orm";
import { backups, type allTables } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { readSetting, writeSetting } from "./cleanup";
import { getGDriveAccessToken, uploadToGDrive } from "@pushpanel/core";
import { getGDriveConfig } from "./secrets";

type PushDb = BetterSQLite3Database<typeof allTables>;

const DEFAULT_RETENTION = 10;
const INTERVALS_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Auto-backup scheduler (m10 backlog G17): when the panel has scheduled
 * backups enabled (`backup_auto_interval` = daily/weekly/monthly), snapshot
 * the live SQLite file into `data/backups/` once per interval.
 */
export function runBackupScheduler(db: PushDb, dbFile: string, nowMs: number = Date.now()): boolean {
  if (!dbFile || dbFile === ":memory:") return false;
  const interval = readSetting(db, "backup_auto_interval");
  if (!interval || interval === "off") return false;

  const intervalMs = INTERVALS_MS[interval];
  if (!intervalMs) return false;

  const lastRunAt = readSetting(db, "last_backup_at");
  if (lastRunAt && nowMs - new Date(lastRunAt).getTime() < intervalMs) return false;

  const created = createSnapshot(db, dbFile, "auto", nowMs);
  if (created) pruneBackups(db, resolveRetention(db));
  return created;
}

/** Create a VACUUM INTO snapshot row + file. */
export function createSnapshot(db: PushDb, dbFile: string, kind: "manual" | "auto" = "manual", nowMs: number = Date.now()): boolean {
  if (!dbFile || dbFile === ":memory:") return false;
  const backupDir = path.join(path.dirname(dbFile), "backups");
  try {
    mkdirSync(backupDir, { recursive: true });
  } catch {
    return false;
  }

  const stamp = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `backup-${kind}-${stamp}.db`);

  try {
    db.run(sql.raw(`VACUUM INTO '${target.replace(/'/g, "''")}'`));
  } catch {
    // Failed attempt still counts: record it and mark last_backup_at so the
    // scheduler backs off for the whole interval instead of hammering the
    // (probably full/permission-broken) disk on every tick.
    db.insert(backups).values({ kind, status: "failed", size_bytes: 0, location: target }).run();
    writeSetting(db, "last_backup_at", new Date(nowMs).toISOString());
    return false;
  }

  let size = 0;
  try {
    size = statSync(target).size;
  } catch {
    // size 0 is acceptable — row presence is what matters
  }

  db.insert(backups).values({ kind, status: "done", size_bytes: size, location: target }).run();
  writeSetting(db, "last_backup_at", new Date(nowMs).toISOString());

  // Fire-and-forget Google Drive upload (disabled by default, best-effort)
  void tryUploadToDrive(db, target).catch(() => {});

  return true;
}

async function tryUploadToDrive(db: PushDb, filePath: string): Promise<void> {
  const { enabled, folderId, serviceJson } = getGDriveConfig(db);
  if (!enabled || !serviceJson) return;
  try {
    const buf = readFileSync(filePath);
    const token = await getGDriveAccessToken(serviceJson);
    const fileName = path.basename(filePath);
    await uploadToGDrive({ accessToken: token, fileName, fileBuffer: buf, folderId: folderId ?? undefined });
  } catch (e) {
    // best-effort: log but don't fail backup
    console.error("[backup] Drive upload failed:", (e as Error).message?.slice(0, 500));
  }
}

/**
 * Keep only the newest `retention` snapshots per kind; delete older rows and
 * their files. Runs opportunistically after each snapshot.
 */
export function pruneBackups(db: PushDb, retention: number = DEFAULT_RETENTION): number {
  let pruned = 0;
  for (const kind of ["manual", "auto"] as const) {
    const rows = db
      .select({ id: backups.id, location: backups.location })
      .from(backups)
      .where(eq(backups.kind, kind))
      .orderBy(desc(backups.id))
      .all();
    const drop = rows.slice(retention);
    for (const row of drop) {
      db.delete(backups).where(eq(backups.id, row.id)).run();
      pruned++;
      if (row.location) {
        try {
          unlinkSync(row.location);
        } catch {
          // file may already be gone — row removal is what matters
        }
      }
    }
  }
  return pruned;
}

/** Retention honored for auto-backups; defaults to `DEFAULT_RETENTION`. */
export function resolveRetention(db: PushDb): number {
  const raw = readSetting(db, "backup_retention");
  const value = Number(raw ?? DEFAULT_RETENTION);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_RETENTION;
  return Math.min(Math.floor(value), 60);
}
