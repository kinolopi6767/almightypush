import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@pushpanel/db";
import { domains, subscribers, workspaces } from "@pushpanel/db/schema";
import { runCleanup, readSetting, writeSetting } from "./cleanup";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { allTables } from "@pushpanel/db";

type Db = BetterSQLite3Database<typeof allTables>;

function seed(db: Db) {
  const ws = db.insert(workspaces).values({ name: "WS", slug: "ws1" }).run();
  const workspaceId = Number(ws.lastInsertRowid);
  const d1 = db
    .insert(domains)
    .values({ workspace_id: workspaceId, name: "one.test", provider: "vapid", status: "active" })
    .run();
  const d2 = db
    .insert(domains)
    .values({ workspace_id: workspaceId, name: "two.test", provider: "vapid", status: "active" })
    .run();
  const domain1 = Number(d1.lastInsertRowid);
  const domain2 = Number(d2.lastInsertRowid);
  db.insert(subscribers)
    .values([
      { domain_id: domain1, token_hash: "a", subscribe_at: "2026-01-01T00:00:00.000Z", unsubscribed_at: "2026-07-01T00:00:00.000Z" },
      { domain_id: domain1, token_hash: "b", subscribe_at: "2026-01-01T00:00:00.000Z", unsubscribed_at: "2026-08-01T00:00:00.000Z" },
      { domain_id: domain1, token_hash: "c", subscribe_at: "2026-01-01T00:00:00.000Z", unsubscribed_at: null },
      { domain_id: domain2, token_hash: "d", subscribe_at: "2026-01-01T00:00:00.000Z", unsubscribed_at: "2026-06-01T00:00:00.000Z" },
    ])
    .run();
}

function counts(db: Db) {
  return db.select().from(subscribers).all().length;
}

describe("runCleanup", () => {
  it("deletes unsubscribed rows older than the retention window", () => {
    const { db } = createMemoryDb();
    seed(db);
    // now Aug 15, 30d retention → cutoff Jul 16: a (Jul 1) and d (Jun 1)
    // are older; b (Aug 1) and c (active) stay.
    const res = runCleanup(db, { retentionDays: 30, now: new Date("2026-08-15T00:00:00.000Z") });
    expect(res.ran).toBe(true);
    expect(res.deleted).toBe(2);
    expect(counts(db)).toBe(2);
    const left = db.select().from(subscribers).all();
    expect(left.map((s) => s.token_hash).sort()).toEqual(["b", "c"]);
  });

  it("keeps rows unsubscribed inside the window", () => {
    const { db } = createMemoryDb();
    seed(db);
    // now Jul 15, cutoff Jun 15: only d (Jun 1) is older.
    const res = runCleanup(db, { retentionDays: 30, now: new Date("2026-07-15T00:00:00.000Z") });
    expect(res.deleted).toBe(1);
    expect(counts(db)).toBe(3);
  });

  it("does nothing when retention is 0", () => {
    const { db } = createMemoryDb();
    seed(db);
    const res = runCleanup(db, { retentionDays: 0 });
    expect(res.ran).toBe(false);
    expect(counts(db)).toBe(4);
  });

  it("is disabled again inside the hourly window", () => {
    const { db } = createMemoryDb();
    seed(db);
    const t0 = new Date("2026-08-15T00:00:00.000Z");
    const first = runCleanup(db, { retentionDays: 30, now: t0 });
    expect(first.ran).toBe(true);
    const second = runCleanup(db, { retentionDays: 30, now: new Date(t0.getTime() + 60_000) });
    expect(second.ran).toBe(false);
    expect(readSetting(db, "last_cleanup_at")).toBe(t0.toISOString());
  });

  it("runs again after the hourly window", () => {
    const { db } = createMemoryDb();
    seed(db);
    const t0 = new Date("2026-08-15T00:00:00.000Z");
    runCleanup(db, { retentionDays: 30, now: t0 });
    const later = runCleanup(db, { retentionDays: 30, now: new Date(t0.getTime() + 3_600_001) });
    expect(later.ran).toBe(true);
  });
});

describe("settings", () => {
  it("writeSetting upserts, readSetting round-trips", () => {
    const { db } = createMemoryDb();
    writeSetting(db, "timezone", "Asia/Kolkata");
    expect(readSetting(db, "timezone")).toBe("Asia/Kolkata");
    writeSetting(db, "timezone", "UTC");
    expect(readSetting(db, "timezone")).toBe("UTC");
    expect(readSetting(db, "missing")).toBeNull();
  });
});
