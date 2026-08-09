import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "@pushpanel/db";
import { automations, campaigns, deliveries, domains, subscribers, workspaces } from "@pushpanel/db/schema";
import { createVapidConfig } from "@pushpanel/core";
import { runAutomations } from "./automation";

const ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function seed(db: Parameters<typeof runAutomations>[0]) {
  const ws = db.insert(workspaces).values({ name: "WS", slug: "ws1" }).run();
  const workspaceId = Number(ws.lastInsertRowid);
  const domain = db
    .insert(domains)
    .values({
      workspace_id: workspaceId,
      name: "demo.test",
      provider: "vapid",
      provider_config_json: JSON.stringify(createVapidConfig(ENC_KEY, "mailto:owner@example.com")),
      status: "active",
    })
    .run();
  const domainId = Number(domain.lastInsertRowid);
  db.insert(subscribers).values({ domain_id: domainId, token_hash: "hash-1", token: "v1:ignored", provider: "vapid" }).run();
  db.insert(subscribers).values({ domain_id: domainId, token_hash: "hash-2", token: "v1:ignored", provider: "vapid" }).run();
  return { workspaceId, domainId };
}

function insertAutomation(
  db: Parameters<typeof runAutomations>[0],
  workspaceId: number,
  domainId: number,
  overrides: { type?: string; config_json?: string; next_run_at?: string | null; status?: string } = {},
): number {
  const res = db
    .insert(automations)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      type: overrides.type ?? "push_on_publish",
      name: "Test automation",
      config_json: overrides.config_json ?? JSON.stringify({ payload: { title: "Update available", message: "Hello" } }),
      next_run_at: overrides.next_run_at ?? new Date(Date.now() - 60_000).toISOString(),
      status: overrides.status ?? "active",
    })
    .run();
  return Number(res.lastInsertRowid);
}

describe("runAutomations", () => {
  it("runs a due push_on_publish automation and clears its slot", async () => {
    const { db } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    insertAutomation(db, workspaceId, domainId);

    const stats = await runAutomations(db);
    expect(stats.ran).toBe(1);
    expect(stats.ok).toBe(1);
    expect(stats.campaigns).toBe(1);

    const [campaign] = db.select({ title: campaigns.title, status: campaigns.status, source: campaigns.source }).from(campaigns).all();
    expect(campaign).toMatchObject({ title: "Update available", status: "sending", source: "automation" });
    const queued = db.select({ id: deliveries.id }).from(deliveries).all();
    expect(queued).toHaveLength(2);

    const [after] = db.select({ next_run_at: automations.next_run_at, error: automations.error }).from(automations).all();
    expect(after?.next_run_at).toBeNull();
    expect(after?.error).toBeNull();
  });

  it("does not run paused, future, or unknown-type automations", async () => {
    const { db } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    insertAutomation(db, workspaceId, domainId, { status: "paused" });
    insertAutomation(db, workspaceId, domainId, { next_run_at: new Date(Date.now() + 60_000).toISOString() });
    insertAutomation(db, workspaceId, domainId, { type: "drip" });

    const stats = await runAutomations(db);
    expect(stats.ran).toBe(1);
    expect(stats.ok).toBe(0);
    expect(stats.failed).toBe(1);
  });

  it("records failures and keeps the error on the row", async () => {
    const { db } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    const id = insertAutomation(db, workspaceId, domainId, {
      type: "automagic_static",
      config_json: JSON.stringify({ payload: { title: "x" }, rotation_json: "" }),
    });

    const stats = await runAutomations(db);
    expect(stats.failed).toBe(1);
    const [row] = db.select({ error: automations.error }).from(automations).where(eq(automations.id, id)).all();
    expect(row?.error).toContain("Rotation list is empty");
  });

  it("welcome_push delay creates a scheduled campaign instead of deliveries", async () => {
    const { db } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    insertAutomation(db, workspaceId, domainId, {
      type: "welcome_push",
      config_json: JSON.stringify({ payload: { title: "Welcome" }, delay_seconds: 3600 }),
    });

    await runAutomations(db);
    const [campaign] = db.select({ status: campaigns.status, schedule_at: campaigns.schedule_at }).from(campaigns).all();
    expect(campaign?.status).toBe("scheduled");
    expect(campaign?.schedule_at).toBeTruthy();
    expect(db.select({ id: deliveries.id }).from(deliveries).all()).toHaveLength(0);
  });

  it("re-arms interval automations after a run", async () => {
    const { db } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    const id = insertAutomation(db, workspaceId, domainId, {
      type: "automagic_static",
      config_json: JSON.stringify({
        payload: { title: "x" },
        rotation_json: JSON.stringify([{ title: "One", body: "first" }, { title: "Two", body: "second" }]),
        interval_minutes: 15,
      }),
    });

    const stats = await runAutomations(db);
    expect(stats.ok).toBe(1);
    const [row] = db.select({ next_run_at: automations.next_run_at }).from(automations).where(eq(automations.id, id)).all();
    expect(row?.next_run_at).toBeTruthy();

    const [campaign] = db.select({ title: campaigns.title }).from(campaigns).all();
    expect(campaign?.title).toBe("One");

    db.update(automations).set({ next_run_at: new Date(Date.now() - 60_000).toISOString() }).where(eq(automations.id, id)).run();
    await runAutomations(db);
    const titles = db.select({ title: campaigns.title }).from(campaigns).orderBy(campaigns.id).all();
    expect(titles.map((t) => t.title)).toEqual(["One", "Two"]);
  });
});
