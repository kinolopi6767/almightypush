import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createMemoryDb, setDbForTests } from "@pushpanel/db";
import { domains, subscribers, subscriberTags, workspaces } from "@pushpanel/db/schema";
import { sha256Hex } from "@pushpanel/core";
import { db } from "@/lib/db";
import { POST as tagsPost } from "@/app/api/v1/tags/route";

let client: ReturnType<typeof createMemoryDb>["client"];

const ENDPOINT = "https://push.example.test/sub/abc123";

function tagsRequest(body: unknown, origin = "https://example.test"): Request {
  return new Request("http://panel.test/api/v1/tags", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/tags key hygiene", () => {
  let domainId = 0;

  beforeEach(() => {
    const mem = createMemoryDb();
    client = mem.client;
    setDbForTests(mem.db);
    const ws = db.insert(workspaces).values({ name: "ws", slug: "ws-tags" }).returning().all()[0]!;
    const domain = db.insert(domains).values({ workspace_id: ws.id, name: "example.test", status: "active" }).returning().all()[0]!;
    domainId = domain.id;
    db.insert(subscribers)
      .values({ domain_id: domain.id, token_hash: sha256Hex(ENDPOINT), token: "enc", provider: "vapid", subscribe_at: new Date().toISOString() })
      .run();
  });

  afterEach(() => {
    setDbForTests(undefined);
    client.close();
  });

  function rows() {
    return db.select({ tag: subscriberTags.tag, value: subscriberTags.value }).from(subscriberTags).all();
  }

  it("stores tags for the active subscription", async () => {
    const res = await tagsPost(tagsRequest({ domainId, endpoint: ENDPOINT, tags: { plan: "pro", logins: 3 } }));
    expect(res.status).toBe(200);
    expect(rows()).toHaveLength(2);
  });

  it("trims keys and dedupes last-wins (no unique-index 500)", async () => {
    const res = await tagsPost(tagsRequest({ domainId, endpoint: ENDPOINT, tags: { plan: "old", "  plan  ": "new" } }));
    expect(res.status).toBe(200);
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ tag: "plan", value: "new" });
  });

  it("rejects blank keys with 400 instead of storing them", async () => {
    const res = await tagsPost(tagsRequest({ domainId, endpoint: ENDPOINT, tags: { "   ": "x" } }));
    expect(res.status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("rejects overlong keys with 400", async () => {
    const res = await tagsPost(tagsRequest({ domainId, endpoint: ENDPOINT, tags: { ["k".repeat(65)]: "x" } }));
    expect(res.status).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("rejects foreign origins with 403", async () => {
    const res = await tagsPost(tagsRequest({ domainId, endpoint: ENDPOINT, tags: { plan: "pro" } }, "https://evil.test"));
    expect(res.status).toBe(403);
    expect(rows()).toHaveLength(0);
  });
});
