import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "@pushpanel/db";
import { campaigns, deliveries, domains, segments, subscribers, workspaces } from "@pushpanel/db/schema";
import { runScheduler } from "../src/scheduler.js";

type Db = ReturnType<typeof createMemoryDb>["db"];

describe("runScheduler", () => {
  function setup() {
    const { db } = createMemoryDb();
    const [ws] = db.insert(workspaces).values({ name: "ws", slug: "ws" }).returning().all();
    const [domain] = db
      .insert(domains)
      .values({ workspace_id: ws!.id, name: "a.example.test", status: "active" })
      .returning()
      .all();
    const insertSub = () =>
      db
        .insert(subscribers)
        .values({
          domain_id: domain!.id,
          token: "enc",
          token_hash: `hash-${Date.now()}-${Math.random()}`,
          provider: "vapid",
        })
        .returning()
        .all()[0]!;
    const s1 = insertSub();
    const s2 = insertSub();
    const s3 = insertSub();
    db.update(subscribers).set({ unsubscribed_at: new Date().toISOString() }).where(eq(subscribers.id, s3.id)).run();
    const insertCampaign = (audience: unknown) =>
      db
        .insert(campaigns)
        .values({ workspace_id: ws!.id, domain_id: domain!.id, title: "c", audience_json: JSON.stringify(audience), status: "scheduled", scheduled: 1, source: "panel" })
        .returning({ id: campaigns.id })
        .all()[0]!.id;
    return { db, ws: ws!, domain: domain!, s1, s2, s3, insertCampaign };
  }

  function deliveriesOf(db: Db, campaignId: number): { subscriber_id: number | null; requested_at: number | null }[] {
    return db.select({ subscriber_id: deliveries.subscriber_id, requested_at: deliveries.requested_at }).from(deliveries).where(eq(deliveries.campaign_id, campaignId)).all();
  }

  function campaignStatus(db: Db, campaignId: number): string {
    return db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, campaignId)).all()[0]!.status;
  }

  it("manual audience delivers exactly the listed ids, re-validated at run time", () => {
    const { db, s1, s2, s3, insertCampaign } = setup();
    const id = insertCampaign({ kind: "manual", ids: [s1.id, s2.id, s3.id, 999_999] });

    const stats = runScheduler(db);
    expect(stats.campaignsStarted).toBe(1);
    expect(stats.deliveriesQueued).toBe(2); // s3 unsubscribed + ghost id dropped

    const rows = deliveriesOf(db, id);
    expect(rows.map((r) => r.subscriber_id).sort()).toEqual([s1.id, s2.id].sort((a, b) => a - b));
    expect(rows.every((r) => r.requested_at !== null)).toBe(true);
    expect(campaignStatus(db, id)).toBe("sending");
  });

  it("manual audience with an empty or missing list finishes the campaign immediately", () => {
    const { db, insertCampaign } = setup();
    const empty = insertCampaign({ kind: "manual", ids: [] });
    const missing = insertCampaign({ kind: "manual" });
    const unknown = insertCampaign({ kind: "whatever" });

    const stats = runScheduler(db);
    expect(stats.deliveriesQueued).toBe(0);
    expect(campaignStatus(db, empty)).toBe("done");
    expect(campaignStatus(db, missing)).toBe("done");
    expect(campaignStatus(db, unknown)).toBe("done");
  });

  it("all audience keeps targeting every active subscriber of the domain", () => {
    const { db, s1, s2, insertCampaign } = setup();
    const id = insertCampaign({ kind: "all" });

    runScheduler(db);
    const rows = deliveriesOf(db, id);
    expect(rows.map((r) => r.subscriber_id).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([s1.id, s2.id]);
  });

  it("segment audience resolves through segment membership", () => {
    const { db, ws, s1, insertCampaign } = setup();
    db.update(subscribers).set({ device: "desktop" }).where(eq(subscribers.id, s1.id)).run();
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: ws.id,
          name: "desktops",
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "desktop" }] }] }),
        })
        .run().lastInsertRowid,
    );
    const id = insertCampaign({ kind: "segment", segment_id: segId });

    runScheduler(db);
    const rows = deliveriesOf(db, id);
    expect(rows.map((r) => r.subscriber_id)).toEqual([s1.id]);
    expect(campaignStatus(db, id)).toBe("sending");
  });

  it("a non-null schedule_at in the future is not started yet", () => {
    const { db, insertCampaign } = setup();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const id = insertCampaign({ kind: "all" });
    db.update(campaigns).set({ schedule_at: later }).where(eq(campaigns.id, id)).run();

    const stats = runScheduler(db);
    expect(stats.campaignsStarted).toBe(0);
    expect(campaignStatus(db, id)).toBe("scheduled");
  });

  it("E7: an A/B campaign (title_b) assigns a deterministic 50/50 variant per subscriber", () => {
    const { db, s1, s2, insertCampaign } = setup();
    const id = insertCampaign({ kind: "all" });
    db.update(campaigns).set({ title_b: "cb" }).where(eq(campaigns.id, id)).run();

    const stats = runScheduler(db);
    expect(stats.deliveriesQueued).toBe(2);

    const rows = db
      .select({ subscriber_id: deliveries.subscriber_id, variant: deliveries.variant })
      .from(deliveries)
      .where(eq(deliveries.campaign_id, id))
      .all();
    const bySub = new Map(rows.map((r) => [r.subscriber_id, r.variant]));
    expect(bySub.get(s1.id)).toBe(s1.id % 2 === 0 ? "a" : "b");
    expect(bySub.get(s2.id)).toBe(s2.id % 2 === 0 ? "a" : "b");
    expect(new Set(rows.map((r) => r.variant)).size).toBe(2);
  });

  it("a campaign without a domain is failed, not sent", () => {
    const { db, ws } = setup();
    const id = db
      .insert(campaigns)
      .values({ workspace_id: ws.id, domain_id: null, title: "c", audience_json: JSON.stringify({ kind: "all" }), status: "scheduled", scheduled: 1, source: "panel" })
      .returning({ id: campaigns.id })
      .all()[0]!.id;

    runScheduler(db);
    expect(campaignStatus(db, id)).toBe("failed");
  });
});