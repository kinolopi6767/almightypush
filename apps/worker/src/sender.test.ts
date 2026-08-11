import { describe, expect, it } from "vitest";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { createMemoryDb } from "@pushpanel/db";
import { campaigns, deliveries, domains, events, settings, subscribers, workspaces } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import type { PushMessage, PushProvider, PushSubscriptionPayload, SendResult } from "@pushpanel/core";
import { createCipher, createVapidConfig } from "@pushpanel/core";
import { allTables } from "@pushpanel/db/schema";
import { runSendCycle, resolveConcurrency } from "./sender";

const ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type PushDb = BetterSQLite3Database<typeof allTables>;

/** Captures requests instead of contacting a push service. */
class CapturingProvider implements PushProvider {
  public calls: { subscription: PushSubscriptionPayload; message: PushMessage }[] = [];
  public nextResult: SendResult = { ok: true, statusCode: 201 };

  async send(subscription: PushSubscriptionPayload, message: PushMessage): Promise<SendResult> {
    this.calls.push({ subscription, message });
    return this.nextResult;
  }
}

function seed(db: PushDb): { workspaceId: number; domainId: number; subscriberId: number } {
  const ws = db.insert(workspaces).values({ name: "WS", slug: "ws1" }).run();
  const workspaceId = Number(ws.lastInsertRowid);

  const vapid = createVapidConfig(ENC_KEY, "mailto:owner@example.com");
  const domain = db
    .insert(domains)
    .values({
      workspace_id: workspaceId,
      name: "demo.test",
      provider: "vapid",
      provider_config_json: JSON.stringify(vapid),
      status: "active",
    })
    .run();
  const domainId = Number(domain.lastInsertRowid);

  const cipher = createCipher(ENC_KEY);
  const token = JSON.stringify({
    endpoint: "https://push.example.com/sub/abc",
    keys: { p256dh: "BP4f9vqZr", auth: "a1b2c3d4" },
  });
  const subscriber = db
    .insert(subscribers)
    .values({ domain_id: domainId, token_hash: "hash-abc", token: cipher.encrypt(token), provider: "vapid" })
    .run();
  const subscriberId = Number(subscriber.lastInsertRowid);

  return { workspaceId, domainId, subscriberId };
}

function enqueueCampaign(db: PushDb, workspaceId: number, domainId: number, subscriberId: number, title = "camp"): number {
  const campaign = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      title,
      message: "works",
      launch_url: "https://demo.test/post",
      status: "sending",
    })
    .run();
  const campaignId = Number(campaign.lastInsertRowid);
  db.insert(deliveries)
    .values({ campaign_id: campaignId, subscriber_id: subscriberId, domain_id: domainId, status: "queued" })
    .run();
  return campaignId;
}

describe("sender send cycle", () => {
  it("sends queued deliveries, marks them sent and updates campaign stats", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    enqueueCampaign(db, workspaceId, domainId, subscriberId);

    const stats = await runSendCycle(db, ENC_KEY, provider);

    expect(stats).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.message).toMatchObject({ title: "camp", body: "works", url: "https://demo.test/post" });
    expect(provider.calls[0]!.subscription.endpoint).toBe("https://push.example.com/sub/abc");

    const [delivery] = db.select().from(deliveries).all();
    expect(delivery?.status).toBe("sent");
    expect(delivery?.sent_at).toBeTruthy();

    const [evt] = db.select().from(events).all();
    expect(evt?.type).toBe("delivered");

    const [camp] = db.select().from(campaigns).all();
    expect(camp?.status).toBe("done");
    expect(camp ? JSON.parse(camp.stats_json) : null).toEqual({ delivered: 1 });
    client.close();
  });

  it("unsubscribes the subscriber when the push service returns 410", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    provider.nextResult = { ok: false, statusCode: 410, error: "Gone" };
    enqueueCampaign(db, workspaceId, domainId, subscriberId);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats).toMatchObject({ claimed: 1, sent: 0, gone: 1 });

    const [sub] = db.select().from(subscribers).all();
    expect(sub?.unsubscribed_at).toBeTruthy();
    expect(sub?.unsub_reason).toBe("http410");

    const [delivery] = db.select().from(deliveries).all();
    expect(delivery?.status).toBe("unsubscribed");
    client.close();
  });

  it("requeues transient failures and fails on the last attempt", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    provider.nextResult = { ok: false, statusCode: 503, error: "busy" };
    const campaignId = enqueueCampaign(db, workspaceId, domainId, subscriberId);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats).toMatchObject({ claimed: 1, sent: 0, requeued: 1 });

    const afterRequeue = db.select().from(deliveries).all()[0]!;
    expect(afterRequeue.status).toBe("queued");
    expect(afterRequeue.attempts).toBe(1);
    expect(afterRequeue.next_attempt_at).toBeGreaterThan(Date.now());

    // Simulate the remaining attempts exhausting the budget.
    client.prepare("UPDATE deliveries SET attempts = 3, next_attempt_at = NULL WHERE campaign_id = ?").run(campaignId);
    provider.nextResult = { ok: false, statusCode: 503, error: "still busy" };
    const stats2 = await runSendCycle(db, ENC_KEY, provider);
    expect(stats2).toMatchObject({ claimed: 1, sent: 0, failed: 1 });

    const [delivery] = db.select().from(deliveries).all();
    expect(delivery?.status).toBe("failed");
    expect(delivery?.error).toContain("busy");
    client.close();
  });

  it("delivers buttons and image from the campaign payload", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    const campaignId = enqueueCampaign(db, workspaceId, domainId, subscriberId, "titled-campaign");
    db.update(campaigns)
      .set({
        image_url: "https://demo.test/banner.png",
        icon_url: "https://demo.test/icon.png",
        buttons_json: JSON.stringify([{ label: "Open", url: "https://demo.test/go" }]),
      })
      .where(eq(campaigns.id, campaignId))
      .run();

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats).toMatchObject({ claimed: 1, sent: 1 });
    const sent = provider.calls[0]!.message;
    expect(sent.image).toBe("https://demo.test/banner.png");
    expect(sent.icon).toBe("https://demo.test/icon.png");
    expect(sent.buttons).toEqual([{ label: "Open", url: "https://demo.test/go" }]);
    client.close();
  });

  it("appends UTM params when the setting is enabled (once per URL)", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    const campaignId = enqueueCampaign(db, workspaceId, domainId, subscriberId, "Flash Sale");
    db.update(campaigns)
      .set({ buttons_json: JSON.stringify([{ label: "Buy", url: "https://demo.test/go?x=1" }]) })
      .where(eq(campaigns.id, campaignId))
      .run();
    db.insert(settings).values({ key: "utm_enabled", value: "1" }).run();

    await runSendCycle(db, ENC_KEY, provider);
    const sent = provider.calls[0]!.message;
    expect(sent.url).toBe(
      "https://demo.test/post?utm_source=pushpanel&utm_medium=push&utm_campaign=Flash-Sale&utm_content=push",
    );
    expect(sent.buttons?.[0]?.url).toBe(
      "https://demo.test/go?x=1&utm_source=pushpanel&utm_medium=push&utm_campaign=Flash-Sale&utm_content=button",
    );
    client.close();
  });

  it("clamps the sending_speed setting into a sane concurrency", () => {
    const { db, client } = createMemoryDb();
    expect(resolveConcurrency(db)).toBe(25);
    db.insert(settings).values({ key: "sending_speed", value: "4" }).run();
    expect(resolveConcurrency(db)).toBe(4);
    db.update(settings).set({ value: "99999" }).where(eq(settings.key, "sending_speed")).run();
    expect(resolveConcurrency(db)).toBe(200);
    db.update(settings).set({ value: "0" }).where(eq(settings.key, "sending_speed")).run();
    expect(resolveConcurrency(db)).toBe(25);
    client.close();
  });

  it("E7: a B-variant delivery sends title_b and tags the delivered event with the variant", async () => {
    const { db, client } = createMemoryDb();
    const { workspaceId, domainId, subscriberId } = seed(db);
    const provider = new CapturingProvider();
    const campaignId = enqueueCampaign(db, workspaceId, domainId, subscriberId, "title-a");
    db.update(campaigns).set({ title_b: "title-b" }).where(eq(campaigns.id, campaignId)).run();
    db.update(deliveries).set({ variant: "b" }).where(eq(deliveries.campaign_id, campaignId)).run();

    const stats = await runSendCycle(db, ENC_KEY, provider);

    expect(stats.sent).toBe(1);
    expect(provider.calls[0]?.message.title).toBe("title-b");

    const [evt] = db.select().from(events).where(eq(events.type, "delivered")).all();
    expect(evt?.meta_json ? JSON.parse(evt.meta_json) : null).toEqual({ variant: "b" });
    client.close();
  });
});