import { describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { createMemoryDb, resolveDbPath } from "../src/index.js";
import { workspaces, users, domains } from "../src/schema/index.js";

describe("db", () => {
  it("migrates an in-memory database with the full schema", () => {
    const { db } = createMemoryDb();
    const tables = db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table'`).map(
      (row) => (row as { name: string }).name,
    );
    expect(tables).toEqual(
      expect.arrayContaining([
        "api_keys",
        "audit_log",
        "automations",
        "backups",
        "campaigns",
        "deliveries",
        "domains",
        "events",
        "lp_links",
        "segments",
        "sessions",
        "settings",
        "subscribers",
        "templates",
        "users",
        "workspaces",
        "youtube_channels",
      ]),
    );
  });

  it("is configured with WAL-compatible pragmas", () => {
    const { client } = createMemoryDb();
    expect(client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(client.pragma("busy_timeout", { simple: true })).toBe(5000);
  });

  it("inserts and reads back a workspace + user in a transaction", async () => {
    const { db } = createMemoryDb();
    const [ws] = await db.insert(workspaces).values({ name: "Test", slug: "test" }).returning();
    expect(ws).toBeDefined();
    expect(ws!.id).toBeGreaterThan(0);

    await db.insert(users).values({
      email: "a@b.c",
      name: "A",
      password_hash: "x",
      workspace_id: ws!.id,
    });

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("a@b.c");
    expect(rows[0]?.role).toBe("owner");
  });

  it("cascades delete from workspace to its domains", async () => {
    const { db } = createMemoryDb();
    const [ws] = await db.insert(workspaces).values({ name: "W" }).returning();
    await db.insert(domains).values({ name: "example.com", workspace_id: ws!.id });
    await db.delete(workspaces).where(eq(workspaces.id, ws!.id));
    const remaining = await db.select().from(domains);
    expect(remaining).toHaveLength(0);
  });

  it("rejects deleting a workspace that still has users (RESTRICT)", async () => {
    const { db } = createMemoryDb();
    const [ws] = await db.insert(workspaces).values({ name: "W" }).returning();
    await db.insert(users).values({ email: "u@x.io", password_hash: "x", workspace_id: ws!.id });
    await expect(db.delete(workspaces).where(eq(workspaces.id, ws!.id))).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});

describe("resolveDbPath", () => {
  it("returns absolute paths untouched", () => {
    expect(resolveDbPath("/tmp/x.db")).toBe("/tmp/x.db");
  });

  it("resolves relative paths against the monorepo root", () => {
    const resolved = resolveDbPath("data/pushpanel.db");
    expect(resolved.endsWith("/data/pushpanel.db")).toBe(true);
  });

  it("defaults when undefined", () => {
    expect(resolveDbPath(undefined)).toContain("pushpanel.db");
  });
});