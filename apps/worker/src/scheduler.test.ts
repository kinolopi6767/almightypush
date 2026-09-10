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

  it("leaves paused-domain campaigns scheduled (they fire on resume)", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    db.update(domains).set({ status: "paused" }).where(eq(domains.id, domainId)).run();
    insertCampaign(db, workspaceId, domainId, { schedule_at: new Date(Date.now() - 60_000).toISOString() });

    const stats = runScheduler(db);
    // Not counted as started: nothing was claimed or queued (paused rows stay
    // `scheduled` and must not trigger fast-poll "started" activity).
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 1 });
    expect(db.select().from(deliveries).all()).toHaveLength(0);

    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.status).toBe("scheduled");

    // Resume → next tick enqueues normally.
    db.update(domains).set({ status: "active" }).where(eq(domains.id, domainId)).run();
    const stats2 = runScheduler(db);
    expect(stats2).toEqual({ campaignsStarted: 1, deliveriesQueued: 1, skipped: 0 });
    client.close();
  });

  it("fails campaigns whose domain row is gone instead of retrying forever", () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId } = seed(db);
    insertCampaign(db, workspaceId, domainId, { schedule_at: new Date(Date.now() - 60_000).toISOString() });
    db.delete(domains).where(eq(domains.id, domainId)).run();

    runScheduler(db);
    const [campaign] = db.select().from(campaigns).all();
    expect(campaign?.status).toBe("failed");
    // Second tick: no infinite retry loop.
    const stats = runScheduler(db);
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 });
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
    // Empty audience finalizes to done but counts no start (no work claimed).
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 1 });

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
    expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 1 });

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
    // The reaper ignores freshly-claimed rows (updated_at < 5min): a campaign
    // claimed seconds ago with no deliveries yet is mid-fan-out, not crashed.
    // Tests backdate updated_at past the guard via raw SQL ($onUpdateFn would
    // otherwise bump it back to now on a drizzle update).
    const backdate = (client: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, id: number) =>
      client.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?").run(new Date(Date.now() - 10 * 60_000).toISOString(), id);

    it("resumes a crash-interrupted fan-out instead of dropping the audience", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db); // one active subscriber
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });
      backdate(client as unknown as { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, stuckId);

      const stats = runScheduler(db);
      expect(stats).toEqual({ campaignsStarted: 0, deliveriesQueued: 0, skipped: 0 });

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("sending");
      expect(stuck?.audience_complete).toBe(1);
      const rows = db.select().from(deliveries).where(eq(deliveries.campaign_id, stuckId)).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("queued");
      client.close();
    });

    it("finishes a crash-interrupted campaign with an empty audience as done", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      // eslint-disable-next-line drizzle/enforce-delete-with-where -- intentional full-table reset in test setup.
      db.delete(subscribers).run();
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });
      backdate(client as unknown as { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, stuckId);

      runScheduler(db);

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("done");
      client.close();
    });

    it("marks done (not failed) when a completed campaign already sent", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });
      db.update(campaigns).set({ audience_complete: 1 }).where(eq(campaigns.id, stuckId)).run();
      // Backdate LAST: a drizzle update bumps updated_at, which would make the
      // campaign look freshly claimed and skip the reaper.
      backdate(client as unknown as { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, stuckId);
      db.insert(deliveries).values({ campaign_id: stuckId, subscriber_id: null, domain_id: domainId, status: "sent", sent_at: Date.now() }).run();

      runScheduler(db);

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("done");
      client.close();
    });

    it("marks done when all deliveries were 410-cleaned (mirrors finalize)", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const stuckId = insertCampaign(db, workspaceId, domainId, { status: "sending" });
      db.update(campaigns).set({ audience_complete: 1 }).where(eq(campaigns.id, stuckId)).run();
      // Backdate LAST: a drizzle update bumps updated_at (see test above).
      backdate(client as unknown as { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } }, stuckId);
      db.insert(deliveries).values({ campaign_id: stuckId, subscriber_id: null, domain_id: domainId, status: "unsubscribed", sent_at: Date.now() }).run();

      runScheduler(db);

      const [stuck] = db.select().from(campaigns).where(eq(campaigns.id, stuckId)).all();
      expect(stuck?.status).toBe("done");
      client.close();
    });

    it("dedupes manual audience ids (no double push)", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId, subscriberId } = seed(db);
      insertCampaign(db, workspaceId, domainId, {
        schedule_at: new Date(Date.now() - 60_000).toISOString(),
        audience_json: JSON.stringify({ kind: "manual", ids: [subscriberId, subscriberId, 1.5, -3, 999999] }),
      });

      const stats = runScheduler(db);
      expect(stats.deliveriesQueued).toBe(1);
      expect(db.select().from(deliveries).all()).toHaveLength(1);
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

    it("bounds due campaigns per tick (no unbounded tick stall)", () => {
      const { db, client } = createMemoryDb();
      const { workspaceId, domainId } = seed(db);
      const past = new Date(Date.now() - 60_000).toISOString();
      for (let i = 0; i < 210; i++) {
        insertCampaign(db, workspaceId, domainId, { schedule_at: past });
      }

      const stats = runScheduler(db);
      // DUE_LIMIT=200: leftovers run next tick instead of stalling one tick.
      expect(stats.campaignsStarted).toBe(200);
      expect(stats.deliveriesQueued).toBe(200);
      const second = runScheduler(db);
      expect(second.campaignsStarted).toBe(10);
      client.close();
    });
  });
});
