import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { createCipher, type PushMessage, type SendResult } from "@pushpanel/core";
import { createMemoryDb } from "@pushpanel/db";
import { campaigns, deliveries, domains, events, subscribers, workspaces } from "@pushpanel/db/schema";
import { MAX_ATTEMPTS, runSendCycle } from "../src/sender.js";

const ENC_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type Db = ReturnType<typeof createMemoryDb>["db"];

export interface FakeSend {
  subscription: { endpoint: string };
  message: PushMessage;
}

function setup() {
  const { db } = createMemoryDb();
  const cipher = createCipher(ENC_KEY);
  const [ws] = db.insert(workspaces).values({ name: "ws", slug: "ws" }).returning().all();
  const [domain] = db
    .insert(domains)
    .values({
      workspace_id: ws!.id,
      name: "a.example.test",
      status: "active",
      provider_config_json: JSON.stringify({
        subject: "mailto:ops@example.test",
        publicKey: "pub",
        privateKeyEnc: cipher.encrypt("private"),
      }),
    })
    .returning()
    .all();
  const [campaign] = db
    .insert(campaigns)
    .values({ workspace_id: ws!.id, domain_id: domain!.id, title: "t", message: "m", launch_url: "https://a.example.test/go", audience_json: "{}", status: "sending", scheduled: 0, source: "panel" })
    .returning()
    .all();
  const insertSub = (unsubscribed = false, withToken = true) =>
    db
      .insert(subscribers)
      .values({
        domain_id: domain!.id,
        token: withToken ? cipher.encrypt(JSON.stringify({ endpoint: `https://push.example.test/${Math.random()}`, keys: { p256dh: "p", auth: "a" } })) : "garbage",
        token_hash: `hash-${Math.random()}`,
        provider: "vapid",
        unsubscribed_at: unsubscribed ? new Date().toISOString() : null,
      })
      .returning()
      .all()[0]!;
  const queue = (subscriberId: number | null, overrides: { status?: string; claimed_at?: number | null; next_attempt_at?: number | null } = {}) =>
    db
      .insert(deliveries)
      .values({
        campaign_id: campaign!.id,
        subscriber_id: subscriberId,
        domain_id: domain!.id,
        requested_at: Date.now(),
        status: overrides.status ?? "queued",
        claimed_at: overrides.claimed_at ?? null,
        next_attempt_at: overrides.next_attempt_at ?? null,
      })
      .returning({ id: deliveries.id })
      .all()[0]!.id;
  return { db, ws: ws!, domain: domain!, campaign: campaign!, insertSub, queue };
}

function deliveryRow(db: Db, id: number) {
  return db.select().from(deliveries).where(eq(deliveries.id, id)).all()[0]!;
}

function eventsOf(db: Db, type: string): number {
  return db.select().from(events).where(eq(events.type, type)).all().length;
}

describe("runSendCycle", () => {
  it("delivers queued rows, sends the tracking fields, and finalizes the campaign", async () => {
    const { db, campaign, insertSub, queue } = setup();
    const sent: FakeSend[] = [];
    const provider = { send: async (sub: { endpoint: string }, msg: PushMessage): Promise<SendResult> => (sent.push({ subscription: sub, message: msg }), { ok: true, statusCode: 201 }) };
    const sub = insertSub();
    const d1 = queue(sub.id);

    const stats = await runSendCycle(db, ENC_KEY, provider);

    expect(stats).toEqual({ claimed: 1, sent: 1, failed: 0, gone: 0, requeued: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.message.title).toBe("t");
    expect(sent[0]!.message.deliveryId).toBe(d1);
    expect(sent[0]!.message.campaignId).toBe(campaign.id);
    expect(sent[0]!.message.subscriberId).toBe(sub.id);

    const row = deliveryRow(db, d1);
    expect(row.status).toBe("sent");
    expect(row.sent_at).toBeTruthy();
    expect(row.attempts).toBe(1);
    expect(eventsOf(db, "delivered")).toBe(1);
    const [camp] = db.select().from(campaigns).where(eq(campaigns.id, campaign.id)).all();
    expect(camp!.status).toBe("done");
    expect(JSON.parse(camp!.stats_json)).toEqual({ delivered: 1 });
  });

  it("retries up to MAX_ATTEMPTS with backoff, then fails permanently", async () => {
    const { db, insertSub, queue } = setup();
    const now = Date.now();
    let left = MAX_ATTEMPTS;
    const provider = { send: async (): Promise<SendResult> => (left-- > 0 ? { ok: false, statusCode: 503, error: "boom" } : { ok: true, statusCode: 201 }) };
    const sub = insertSub();
    const d1 = queue(sub.id);

    const cycle1 = await runSendCycle(db, ENC_KEY, provider, now);
    void cycle1;
    let row = deliveryRow(db, d1);
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.next_attempt_at).toBeGreaterThan(now);

    // Backoff elapsed → second attempt, still retrying.
    const later = now + 3600_000;
    db.update(deliveries).set({ next_attempt_at: 1 }).where(eq(deliveries.id, d1)).run();
    await runSendCycle(db, ENC_KEY, provider, later);
    row = deliveryRow(db, d1);
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(2);

    // Third attempt exhausts the budget → permanent failure.
    db.update(deliveries).set({ next_attempt_at: 1 }).where(eq(deliveries.id, d1)).run();
    await runSendCycle(db, ENC_KEY, provider, now + 3600_000);
    row = deliveryRow(db, d1);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(3);
    expect(row.error).toBe("boom");
    expect(eventsOf(db, "delivered")).toBe(0);
  });

  it("does not reclaim rows another worker holds, but revives stale claims", async () => {
    const { db, insertSub, queue } = setup();
    const sent: FakeSend[] = [];
    const provider = { send: async (sub: { endpoint: string }, msg: PushMessage): Promise<SendResult> => (sent.push({ subscription: sub, message: msg }), { ok: true, statusCode: 201 }) };
    const sub = insertSub();
    queue(sub.id);
    const d2 = queue(sub.id);

    // A parallel worker already claimed d2 (but crashes before sending).
    const claimedAt = Date.now() - 60_000;
    db.update(deliveries).set({ status: "sending", claimed_at: claimedAt, attempts: 1 }).where(eq(deliveries.id, d2)).run();

    const stats = await runSendCycle(db, ENC_KEY, provider);
    // d1 sent, d2 NOT reclaimed (stale threshold not reached).
    expect(stats.claimed).toBe(1);
    expect(sent).toHaveLength(1);
    expect(deliveryRow(db, d2).status).toBe("sending");

    // Well past the stale threshold → the crash is detected and it delivers.
    const stale = new Date(claimedAt + 11 * 60_000).getTime();
    const stats2 = await runSendCycle(db, ENC_KEY, provider, stale);
    expect(stats2.claimed).toBe(1);
    expect(sent).toHaveLength(2);
    expect(deliveryRow(db, d2).status).toBe("sent");
    expect(deliveryRow(db, d2).attempts).toBe(2);
  });

  it("sends concurrently with a bounded pool", async () => {
    const { db, insertSub, queue } = setup();
    let inFlight = 0;
    let maxInFlight = 0;
    const provider = {
      send: async (): Promise<SendResult> => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return { ok: true, statusCode: 201 };
      },
    };
    const sub = insertSub();
    for (let i = 0; i < 50; i++) queue(sub.id);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats.claimed).toBe(50);
    expect(stats.sent).toBe(50);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(25);
  });

  it("marks missing or unsubscribed subscribers as failed without sending", async () => {
    const { db, insertSub, queue } = setup();
    const sent: FakeSend[] = [];
    const provider = { send: async (sub: { endpoint: string }, msg: PushMessage): Promise<SendResult> => (sent.push({ subscription: sub, message: msg }), { ok: true, statusCode: 201 }) };
    const unsub = insertSub(true);
    const d1 = queue(null);
    const d2 = queue(unsub.id);
    const d3 = queue(insertSub().id);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats.failed).toBe(2);
    expect(stats.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(deliveryRow(db, d1).status).toBe("failed");
    expect(deliveryRow(db, d2).status).toBe("failed");
    expect(deliveryRow(db, d3).status).toBe("sent");
  });

  it("marks 404/410 as unsubscribed and stops sending to that subscriber", async () => {
    const { db, insertSub, queue } = setup();
    const provider = { send: async (): Promise<SendResult> => ({ ok: false, statusCode: 410, error: "gone" }) };
    const sub = insertSub();
    const d1 = queue(sub.id);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats.gone).toBe(1);
    expect(deliveryRow(db, d1).status).toBe("unsubscribed");
    const [s] = db.select().from(subscribers).where(and(eq(subscribers.id, sub.id), isNull(subscribers.unsubscribed_at))).all();
    expect(s).toBeUndefined();
    expect(eventsOf(db, "unsubscribed")).toBe(1);
  });

  it("fails fast when the domain has no valid VAPID config", async () => {
    const { db, domain, insertSub, queue } = setup();
    db.update(domains).set({ provider_config_json: "{}" }).where(eq(domains.id, domain.id)).run();
    const sent: FakeSend[] = [];
    const provider = { send: async (sub: { endpoint: string }, msg: PushMessage): Promise<SendResult> => (sent.push({ subscription: sub, message: msg }), { ok: true, statusCode: 201 }) };
    const sub = insertSub();
    const d1 = queue(sub.id);

    const stats = await runSendCycle(db, ENC_KEY, provider);
    expect(stats.failed).toBe(1);
    expect(sent).toHaveLength(0);
    expect(deliveryRow(db, d1).status).toBe("failed");
    expect(deliveryRow(db, d1).error).toContain("vapid config");
  });
});