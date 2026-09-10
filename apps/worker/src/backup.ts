import path from "node:path";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { backups, type allTables, backupDatabase } from "@pushpanel/db";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { readSetting, writeSetting, markerIsRecent } from "./cleanup";
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
export async function runBackupScheduler(db: PushDb, dbFile: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!dbFile || dbFile === ":memory:") return false;
  const interval = readSetting(db, "backup_auto_interval");
  if (!interval || interval === "off") return false;

  const intervalMs = INTERVALS_MS[interval];
  if (!intervalMs) return false;

  const lastRunAt = readSetting(db, "last_backup_at");
  // Corrupt marker (NaN) must fail "due", or a garbage value would silently
  // skip backups forever.
  if (markerIsRecent(lastRunAt, nowMs, intervalMs)) return false;

  // Cooldown after a failed attempt: retry hourly instead of every tick
  // (disk hammering) or next interval (data-loss gap). Applies only when the
  // failure is newer than the last success (ISO-8601 strings compare
  // chronologically for identical formats).
  const lastAttempt = readSetting(db, "last_backup_attempt_at");
  if (lastAttempt && (!lastRunAt || lastAttempt > lastRunAt) && markerIsRecent(lastAttempt, nowMs, 3_600_000)) return false;

  const created = await createSnapshot(db, dbFile, "auto", nowMs);
  // Prune on every scheduler pass while auto-backups are enabled — not only
  // after a successful snapshot. pruneBackups only ran post-snapshot, so a
  // stretched interval (monthly) or repeated snapshot failures let rows +
  // files accumulate unbounded. Pruning is a cheap indexed query over a
  // tiny table; running it per tick is safe (throttled to 1/hour below).
  maybePrune(db, nowMs);
  return created;
}

/** Hourly-throttled prune so every-tick calls stay cheap. */
function maybePrune(db: PushDb, nowMs: number): void {
  try {
    const last = readSetting(db, "last_backup_prune_at");
    if (markerIsRecent(last, nowMs, 3_600_000)) return;
    pruneBackups(db, resolveRetention(db));
    writeSetting(db, "last_backup_prune_at", new Date(nowMs).toISOString());
  } catch {
    // best-effort — prune must never break the backup tick
  }
}

/** Create a consistent snapshot row + file (non-blocking backup API). */
export async function createSnapshot(db: PushDb, dbFile: string, kind: "manual" | "auto" = "manual", nowMs: number = Date.now()): Promise<boolean> {
  if (!dbFile || dbFile === ":memory:") return false;
  const backupDir = path.join(path.dirname(dbFile), "backups");
  try {
    mkdirSync(backupDir, { recursive: true });
  } catch {
    return false;
  }

  const stamp = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  // Random suffix: two snapshots in the same millisecond (manual click during
  // an auto run) must not share a filename — the second would overwrite the
  // first while both rows reference it, and pruning one would orphan the other.
  const target = path.join(backupDir, `backup-${kind}-${stamp}-${randomBytes(4).toString("hex")}.db`);

  try {
    await backupDatabase(db, target);
    // Snapshots contain password hashes + encrypted subscriber tokens — owner
    // -read-only so other users/processes on a shared host cannot read them.
    try {
      chmodSync(target, 0o600);
    } catch {
      /* non-fatal — e.g. exotic filesystems */
    }
  } catch {
    // Failed attempt must NOT advance last_backup_at: that marker gates the
    // whole interval (daily/weekly/monthly), so a full disk or permission
    // error would otherwise silence backups for the entire period. Record the
    // failure row and a short-retry marker instead — the scheduler retries
    // hourly after a failure rather than hammering every tick.
    // Failure recording itself is best-effort (the DB may be the thing that
    // is broken) — it must never throw out of the scheduler tick.
    // Remove the partial file first: a half-written snapshot is corrupt and
    // would otherwise be orphaned on disk (no row reaches pruneBackups).
    try {
      unlinkSync(target);
    } catch {
      void 0;
    }
    try {
      db.insert(backups).values({ kind, status: "failed", size_bytes: 0, location: target }).run();
    } catch {
      void 0;
    }
    try {
      writeSetting(db, "last_backup_attempt_at", new Date(nowMs).toISOString());
    } catch {
      void 0;
    }
    return false;
  }

  let size = 0;
  try {
    size = statSync(target).size;
  } catch {
    // size 0 is acceptable — row presence is what matters
  }

  // Success-path writes must not throw out of the scheduler: a locked DB or
  // full disk here would otherwise hammer every tick (no cooldown recorded)
  // and abort the rest of the worker tick. Record best-effort.
  try {
    db.insert(backups).values({ kind, status: "done", size_bytes: size, location: target }).run();
  } catch {
    // The snapshot exists but no row references it — pruneBackups can never
    // see it, so the scheduler would create another full-size file every
    // cooldown until the disk fills. Delete it and record the attempt so the
    // retry is hourly, not every tick.
    try {
      unlinkSync(target);
    } catch {
      void 0;
    }
    try {
      writeSetting(db, "last_backup_attempt_at", new Date(nowMs).toISOString());
    } catch {
      void 0;
    }
    return false;
  }
  try {
    writeSetting(db, "last_backup_at", new Date(nowMs).toISOString());
  } catch {
    // Row exists; marker loss only causes an extra snapshot next interval.
  }

  // Fire-and-forget Google Drive upload (disabled by default, best-effort)
  void tryUploadToDrive(db, target).catch(() => {});

  return true;
}

async function tryUploadToDrive(db: PushDb, filePath: string): Promise<void> {
  const { enabled, folderId, serviceJson } = getGDriveConfig(db);
  if (!enabled || !serviceJson) return;
  let size = 0;
  try {
    size = statSync(filePath).size;
  } catch {
    return; // pruned between snapshot and upload — nothing to send
  }
  // Guard: uploadToGDrive buffers the file in RAM — a multi-GB backup would
  // OOM the worker. Skip oversized snapshots (local copy still exists).
  const limit = 350 * 1024 * 1024;
  if (size > limit) {
    // NOTE: pino logger is not threaded through here (signature is shared
    // with tests); console is the worker's stderr stream — same destination.
    console.error("[backup] Drive upload skipped — file exceeds 350MB in-memory limit");
    return;
  }
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
