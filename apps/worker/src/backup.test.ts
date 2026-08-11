import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@pushpanel/db";
import { backups, settings, type allTables } from "@pushpanel/db/schema";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { createSnapshot, pruneBackups, resolveRetention, runBackupScheduler } from "./backup";
import { writeSetting } from "./cleanup";

type PushDb = BetterSQLite3Database<typeof allTables>;

describe("backup scheduler", () => {
  it("does nothing when auto backups are off", () => {
    const { db, client } = createMemoryDb();
    const made = runBackupScheduler(db, "/tmp/nowhere/app.db");
    expect(made).toBe(false);
    expect(db.select({ id: backups.id }).from(backups).all()).toHaveLength(0);
    client.close();
  });

  it("creates a snapshot when an interval has elapsed (or none before)", () => {
    const { db, client } = createMemoryDb();
    db.insert(settings).values({ key: "backup_auto_interval", value: "daily" }).run();
    const made = runBackupScheduler(db, "/tmp/backup-sched-test/app.db");
    expect(made).toBe(true);
    expect(db.select({ id: backups.id, kind: backups.kind }).from(backups).all()).toHaveLength(1);
    // no second snapshot until the interval passes
    expect(runBackupScheduler(db, "/tmp/backup-sched-test/app.db")).toBe(false);
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

  it("createSnapshot tolerates a missing/unwritable directory silently", () => {
    const { db, client } = createMemoryDb();
    expect(createSnapshot(db, "/dev/null/definitely-not-a-dir/app.db", "manual")).toBe(false);
    expect(db.select({ id: backups.id }).from(backups).all()).toHaveLength(0);
    client.close();
  });
});
