import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../src/index";
import { domains, segments, subscribers } from "../src/schema";
import { workspaces } from "../src/schema/core";
import { estimateSegmentRules, refreshSegmentEstimate, resolveSegment } from "../src/services/segments";

function seed(db: ReturnType<typeof createMemoryDb>["db"], client: ReturnType<typeof createMemoryDb>["client"]) {
  const wsId = Number(
    db.insert(workspaces).values({ name: "ws", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).run().lastInsertRowid,
  );
  const d1 = Number(
    db
      .insert(domains)
      .values({ workspace_id: wsId, name: "a.test", created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .run().lastInsertRowid,
  );
  const d2 = Number(
    db
      .insert(domains)
      .values({ workspace_id: wsId, name: "b.test", created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .run().lastInsertRowid,
  );
  // 2 Android subscribers on domain a, 1 iOS on domain b, 1 unsubscribed Android.
  const mk = (domainId: number, device: string, os: string, unsub = false) =>
    db
      .insert(subscribers)
      .values({
        domain_id: domainId,
        token_hash: `${device}-${os}-${domainId}-${unsub}-${Math.random()}`,
        device,
        os,
        subscribe_url: "https://a.test/landing",
        subscribe_at: "2026-05-01T00:00:00.000Z",
        unsubscribed_at: unsub ? "2026-06-01T00:00:00.000Z" : null,
      })
      .run();
  mk(d1, "android", "android");
  mk(d1, "android", "android");
  mk(d1, "desktop", "windows");
  mk(d2, "iphone", "ios");
  mk(d2, "android", "android", true); // unsubscribed — must never match
  return { wsId, d1, d2, client };
}

describe("resolveSegment", () => {
  it("resolves active subscribers matching the rules", () => {
    const { db, client } = createMemoryDb();
    const { wsId } = seed(db, client);
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: wsId,
          name: "android",
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "android" }] }] }),
        })
        .run().lastInsertRowid,
    );
    const match = resolveSegment(db, { workspaceId: wsId, segmentId: segId });
    // 2 active Android + 1 unsubscribed Android → only 2 match.
    expect(match.count).toBe(2);
  });

  it("excludes unsubscribed subscribers", () => {
    const { db, client } = createMemoryDb();
    const { wsId } = seed(db, client);
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: wsId,
          name: "android",
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "os", op: "equals", value: "android" }] }] }),
        })
        .run().lastInsertRowid,
    );
    const match = resolveSegment(db, { workspaceId: wsId, segmentId: segId });
    expect(match.count).toBe(2); // 2 active android, 1 unsubscribed skipped
  });

  it("honors the segment domain filter", () => {
    const { db, client } = createMemoryDb();
    const { wsId, d1 } = seed(db, client);
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: wsId,
          name: "android-a",
          domain_ids_json: JSON.stringify([d1]),
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "android" }] }] }),
        })
        .run().lastInsertRowid,
    );
    const match = resolveSegment(db, { workspaceId: wsId, segmentId: segId });
    expect(match.count).toBe(2);
  });

  it("supports url contains conditions", () => {
    const { db, client } = createMemoryDb();
    const { wsId } = seed(db, client);
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: wsId,
          name: "landing",
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "url", op: "contains", value: "/land" }] }] }),
        })
        .run().lastInsertRowid,
    );
    expect(resolveSegment(db, { workspaceId: wsId, segmentId: segId }).count).toBe(4);
  });
});

describe("estimateSegmentRules", () => {
  it("estimates without persisting a segment", () => {
    const { db, client } = createMemoryDb();
    const { wsId } = seed(db, client);
    const count = estimateSegmentRules(
      db,
      { groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "android" }] }] },
      undefined,
    );
    expect(count).toBe(2);
    void wsId;
  });
});

describe("refreshSegmentEstimate", () => {
  it("persists estimate_count and estimate_at", () => {
    const { db, client } = createMemoryDb();
    const { wsId } = seed(db, client);
    const segId = Number(
      db
        .insert(segments)
        .values({
          workspace_id: wsId,
          name: "android",
          conditions_json: JSON.stringify({ groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "android" }] }] }),
        })
        .run().lastInsertRowid,
    );
    refreshSegmentEstimate(db, segId, wsId);
    const [row] = db.select({ count: segments.estimate_count, at: segments.estimate_at }).from(segments).where(eq(segments.id, segId)).all();
    expect(row?.count).toBe(2);
    expect(row?.at).toBeTruthy();
  });
});
