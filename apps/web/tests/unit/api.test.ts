import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createMemoryDb, setDbForTests } from "@pushpanel/db";
import { apiKeys, campaigns, domains, events, segments, settings, subscribers, workspaces } from "@pushpanel/db/schema";
import { sha256Hex, generateApiKeyToken } from "@pushpanel/core";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { GET as statsGet } from "@/app/api/v1/stats/route";
import { POST as sendPost } from "@/app/api/v1/send/route";

let client: ReturnType<typeof createMemoryDb>["client"];

function apiKeyHeader(token: string): Headers {
  return new Headers({ "x-api-key": token });
}

function jsonBody(data: unknown, token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-api-key"] = token;
  return new Request("http://panel.test/api/v1/send", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
}

describe("API v1 (H5/H6/H7)", () => {
  beforeEach(() => {
    const mem = createMemoryDb();
    client = mem.client;
    setDbForTests(mem.db);
  });

  afterEach(() => {
    setDbForTests(undefined);
    client.close();
  });

  function seed() {
    const ws = db.insert(workspaces).values({ name: "ws", slug: "ws" }).returning().all()[0]!;
    const domain = db
      .insert(domains)
      .values({ workspace_id: ws.id, name: "example.test", status: "active" })
      .returning()
      .all()[0]!;
    const sub1 = db
      .insert(subscribers)
      .values({ domain_id: domain.id, token_hash: `h1-${Math.random()}`, token: "enc", provider: "vapid", subscribe_at: new Date().toISOString() })
      .returning()
      .all()[0]!;
    const sub2 = db
      .insert(subscribers)
      .values({ domain_id: domain.id, token_hash: `h2-${Math.random()}`, token: "enc", provider: "vapid", subscribe_at: new Date().toISOString() })
      .returning()
      .all()[0]!;
    const token = generateApiKeyToken();
    db.insert(apiKeys).values({ workspace_id: ws.id, label: "t", token_hash: sha256Hex(token) }).run();
    const seg = db
      .insert(segments)
      .values({ workspace_id: ws.id, name: "seg", conditions_json: "[]" })
      .returning()
      .all()[0]!;
    return { ws, domain, sub1, sub2, token, seg };
  }

  it("requireApiKey resolves a valid key and rejects unknown/expired ones", () => {
    const { token } = seed();
    const ok = requireApiKey(apiKeyHeader(token));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.context.workspaceId).toBe(1);

    const bad = requireApiKey(apiKeyHeader("ppk_live_" + "0".repeat(48)));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(401);

    db.update(apiKeys).set({ expires_at: "2000-01-01T00:00:00.000Z" }).where(sql`1=1`).run();
    const expired = requireApiKey(apiKeyHeader(token));
    expect(expired.ok).toBe(false);
  });

  it("G8: requireApiKey refuses when API access is disabled", () => {
    const { token } = seed();
    db.insert(settings).values({ key: "api_access_enabled", value: "0" }).run();
    const res = requireApiKey(apiKeyHeader(token));
    expect(res.ok).toBe(false);
  });

  it("H7: GET /api/v1/stats returns workspace totals and series", async () => {
    const { domain, token } = seed();
    db.insert(events)
      .values([
        { domain_id: domain.id, type: "delivered", ts: new Date().toISOString() },
        { domain_id: domain.id, type: "clicked", ts: new Date().toISOString() },
      ])
      .run();

    const res = await statsGet(new Request("http://panel.test/api/v1/stats", { headers: apiKeyHeader(token) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: { subscribers: number; active: number; delivered: number; clicked: number; domains: number };
      series: { growth: unknown[]; activity: unknown[] };
      campaigns: unknown[];
    };
    expect(body.totals.subscribers).toBe(2);
    expect(body.totals.active).toBe(2);
    expect(body.totals.delivered).toBe(1);
    expect(body.totals.clicked).toBe(1);
    expect(body.totals.domains).toBe(1);
    expect(body.series.growth.length).toBe(1);
    expect(body.series.activity.length).toBe(1);
    expect(body.campaigns).toEqual([]);
  });

  it("H7: stats without a key is refused", async () => {
    const res = await statsGet(new Request("http://panel.test/api/v1/stats"));
    expect(res.status).toBe(401);
  });

  it("H6: POST /api/v1/send queues an all-audience campaign for now", async () => {
    const { domain, token } = seed();
    const res = await sendPost(
      jsonBody({ domain: domain.name, title: "Hello", message: "World", url: "https://example.test/x" }, token),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: number };
    expect(body.ok).toBe(true);

    const [camp] = db.select().from(campaigns).all();
    expect(camp?.status).toBe("scheduled");
    expect(camp?.source).toBe("api");
    expect(camp?.title).toBe("Hello");
    expect(camp?.audience_json).toBe(JSON.stringify({ kind: "all" }));
    expect(camp?.schedule_at).toBeTruthy();
  });

  it("H6: manual and segment audiences are persisted; foreign segments are rejected", async () => {
    const { domain, token, sub1, sub2, seg } = seed();

    const manual = await sendPost(jsonBody({ domain: domain.id, title: "M", audience: { kind: "manual", ids: [sub1.id, sub2.id, 999] } }, token));
    expect(manual.status).toBe(201);

    const segReq = await sendPost(jsonBody({ domain: domain.id, title: "S", audience: { kind: "segment", segment_id: seg.id } }, token));
    expect(segReq.status).toBe(201);

    const [foreign] = db.insert(workspaces).values({ name: "other", slug: "other" }).returning().all();
    const otherSeg = db
      .insert(segments)
      .values({ workspace_id: foreign!.id, name: "foreign", conditions_json: "[]" })
      .returning()
      .all()[0]!;
    const bad = await sendPost(jsonBody({ domain: domain.id, title: "X", audience: { kind: "segment", segment_id: otherSeg.id } }, token));
    expect(bad.status).toBe(404);
  });

  it("H6: validation — bad title, bad url, dup buttons, unknown domain", async () => {
    const { domain, token } = seed();
    expect((await sendPost(jsonBody({ domain: domain.id, title: "" }, token))).status).toBe(400);
    expect((await sendPost(jsonBody({ domain: domain.id, title: "t", url: "ftp://x" }, token))).status).toBe(400);
    expect(
      (await sendPost(jsonBody({ domain: domain.id, title: "t", buttons: [{ label: "a", url: "https://a.test" }, { label: "a", url: "https://b.test" }] }, token))).status,
    ).toBe(400);
    expect((await sendPost(jsonBody({ domain: "nope.test", title: "t" }, token))).status).toBe(404);
  });
});