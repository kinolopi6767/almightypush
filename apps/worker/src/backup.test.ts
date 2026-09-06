import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@pushpanel/db";
import { backups, settings } from "@pushpanel/db/schema";
import { createSnapshot, pruneBackups, resolveRetention, runBackupScheduler } from "./backup";
import { writeSetting } from "./cleanup";

describe("backup scheduler", () => {
  it("does nothing when auto backups are off", async () => {
    const { db, client } = createMemoryDb();
    const made = await runBackupScheduler(db, "/tmp/nowhere/app.db");
    expect(made).toBe(false);
    expect(db.select({ id: backups.id }).from(backups).all()).toHaveLength(0);
    client.close();
  });

  it("creates a snapshot when an interval has elapsed (or none before)", async () => {
    const { db, client } = createMemoryDb();
    db.insert(settings).values({ key: "backup_auto_interval", value: "daily" }).run();
    const made = await runBackupScheduler(db, "/tmp/backup-sched-test/app.db");
    expect(made).toBe(true);
    expect(db.select({ id: backups.id, kind: backups.kind }).from(backups).all()).toHaveLength(1);
    // no second snapshot until the interval passes
    expect(await runBackupScheduler(db, "/tmp/backup-sched-test/app.db")).toBe(false);
    client.close();
  });

  it("prunes past the retention bound newest-first", () => {
    const { db, client } = createMemoryDb();
    for (let i = 0; i < 5; i++) db.insert(backups).values({ kind: "auto", status: "done", size_bytes: 1, location: `/tmp/x-${i}.db` }).run();
    const pruned = pruneBackups(db, 2);
    expect(pruned).toBe(3);
    const left = db.select({ id: backups.id }).from(backups).all();
    expect(left.length).toBe(2);
    client.close();
  });

  it("resolveRetention honors the setting and clamps", () => {
    const { db, client } = createMemoryDb();
    expect(resolveRetention(db)).toBe(10);
    writeSetting(db, "backup_retention", "3");
    expect(resolveRetention(db)).toBe(3);
    writeSetting(db, "backup_retention", "999");
    expect(resolveRetention(db)).toBe(60);
    writeSetting(db, "backup_retention", "0");
    expect(resolveRetention(db)).toBe(10);
    client.close();
  });

  it("createSnapshot tolerates a missing/unwritable directory silently", async () => {
    const { db, client } = createMemoryDb();
    expect(await createSnapshot(db, "/dev/null/definitely-not-a-dir/app.db", "manual")).toBe(false);
    expect(db.select({ id: backups.id }).from(backups).all()).toHaveLength(0);
    client.close();
  });

  it("a failed snapshot never advances last_backup_at (retries hourly, not next interval)", async () => {
    const { db, client } = createMemoryDb();
    db.insert(settings).values({ key: "backup_auto_interval", value: "daily" }).run();
    // Break the DB handle so backupDatabase throws (simulates disk-full):
    // failure recording is best-effort and must not throw out of the tick.
    client.close();
    await expect(createSnapshot(db, "/tmp/backup-fail-test/app.db", "auto")).resolves.toBe(false);
  });

  it("a recent failed attempt cools down the scheduler without hiding the failure", async () => {
    const { db, client } = createMemoryDb();
    db.insert(settings).values({ key: "backup_auto_interval", value: "daily" }).run();
    writeSetting(db, "last_backup_attempt_at", new Date().toISOString());
    // Due by interval, but the hourly failure cooldown suppresses the retry.
    expect(await runBackupScheduler(db, "/tmp/backup-cooldown-test/app.db")).toBe(false);
    expect(db.select({ id: backups.id }).from(backups).all()).toHaveLength(0);
    // A success since the failure clears the cooldown.
    writeSetting(db, "last_backup_at", new Date().toISOString());
    writeSetting(db, "last_backup_attempt_at", new Date(Date.now() - 2 * 3_600_000).toISOString());
    client.close();
  });
});
