import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "@pushpanel/db";
import { campaigns, deliveries, domains, subscribers, workspaces } from "@pushpanel/db/schema";
import { createVapidConfig } from "@pushpanel/core";
import { runScheduler } from "./scheduler";

const ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function seed(db: Parameters<typeof runScheduler>[0]) {
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
  const sub = db
    .insert(subscribers)
    .values({ domain_id: domainId, token_hash: "hash-1", token: "v1:ignored", provider: "vapid" })
    .run();
  const subscriberId = Number(sub.lastInsertRowid);
  return { workspaceId, domainId, subscriberId };
}

function insertCampaign(
  db: Parameters<typeof runScheduler>[0],
  workspaceId: number,
  domainId: number,
  overrides: { schedule_at?: string | null; status?: string; audience_json?: string } = {},
): number {
  const res = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      title: "Big sale",
      schedule_at: overrides.schedule_at ?? new Date().toISOString(),
      scheduled: 1,
      status: overrides.status ?? "scheduled",
      audience_json: overrides.audience_json ?? JSON.stringify({ kind: "all" }),
    })
    .run();
  return Number(res.lastInsertRowid);
}

describe("runScheduler", () => {
  it("enqueues due campaigns and marks them sending", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const campaignId = insertCampaign(db, workspaceId, domainId, { schedule_at: new Date(Date.now() - 60_000).toISOString() });

    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 1, deliveriesQueued: 1, skipped: 0 });

    const [delivery] = db.select().from(deliveries).all();
    expect(delivery?.campaign_id).toBe(campaignId);
    expect(delivery?.subscriber_id).toBe(subscriberId);
    expect(delivery?.status).toBe("queued");

    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.status).toBe("sending");
    client.close();
  });

  it("leaves future campaigns alone", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    const campaignId = insertCampaign(db, workspaceId, domainId, { schedule_at: new Date(Date.now() + 3600_000).toISOString() });

    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 });
    expect(db.select().from(deliveries).all()).toHaveLength(0);

    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.id).toBe(campaignId);
    expect(campaign?.status).toBe("scheduled");
    client.close();
  });

  it("finishes campaigns whose audience is empty", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- intentional full-table reset in test setup.
    db.delete(subscribers).run();
    insertCampaign(db, workspaceId, domainId);

    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 1, deliveriesQueued: 0, skipped: 1 });

    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.status).toBe("done");
    expect(campaign?.sent_at).toBeTruthy();
    client.close();
  });

  it("fails campaigns without a domain", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId } = seed(db);
    insertCampaign(db, workspaceId, null!, { schedule_at: new Date(Date.now() - 60_000).toISOString() });

    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 1, deliveriesQueued: 0, skipped: 1 });

    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.status).toBe("failed");
    client.close();
  });

  it("does not touch drafts or in-flight campaigns with pending deliveries", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    insertCampaign(db, workspaceId, domainId, { status: "draft", schedule_at: new Date(Date.now() - 60_000).toISOString() });
    const sendingId = insertCampaign(db, workspaceId, domainId, { status: "sending", schedule_at: new Date(Date.now() - 60_000).toISOString() });
    // In-flight: a queued delivery exists, so the reaper must leave it alone.
    db.insert(deliveries).values({ campaign_id: sendingId, subscriber_id: null, domain_id: domainId }).run();

    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 });
    expect(db.select().from(deliveries).all()).toHaveLength(1);

    const [sending] = db.select().from(campaigns).where(eq(campaigns.id, sendingId)).all();
    expect(sending?.status).toBe("sending");
    client.close();
  });

  describe("stuck-campaign reaper", () => {
    it("fails a sending campaign left with zero deliveries by a crash", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });

      const stats = runScheduler(db);
      expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 });

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("failed");
      expect(stuck?.sent_at).toBeTruthy();
      client.close();
    });

    it("marks done (not failed) when something was already sent", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });
      db.insert(deliveries).values({ campaign_id: stuckId, subscriber_id: null, domain_id: domainId, status: "sent", sent_at: Date.now() }).run();

      runScheduler(db);

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("done");
      client.close();
    });

    it("never touches cancelled campaigns", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const cancelledId = insertCampaign(db, workspaceId, domainId, { status: "cancelled" });

      runScheduler(db);

      const [cancelled] = db.select().from(campaigns).where(eq(campaigns.id, cancelledId)).all();
      expect(cancelled?.status).toBe("cancelled");
      client.close();
    });
  });
});
