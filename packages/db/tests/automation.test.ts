import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "../src/index.js";
import { enqueueAutomationCampaign } from "../src/services/automation.js";
import { automations, campaigns, deliveries, domains, events, workspaces } from "../src/schema/index.js";

describe("enqueueAutomationCampaign (empty audience)", () => {
  it("finishes a campaign as done instead of leaving it sending forever", () => {
    const { db } = createMemoryDb();
    const wsId = Number(db.insert(workspaces).values({ name: "W" }).run().lastInsertRowid);
    const domainId = Number(db.insert(domains).values({ name: "x.io", workspace_id: wsId }).run().lastInsertRowid);
    const automationId = Number(
      db.insert(automations).values({ workspace_id: wsId, domain_id: domainId, name: "A", type: "push_on_publish" }).run()
        .lastInsertRowid,
    );

    const result = enqueueAutomationCampaign({
      db,
      workspaceId: wsId,
      domainId,
      automationId,
    });

    expect(result.queued).toBe(0);
    const [campaign] = db.select().from(campaigns).where(eq(campaigns.id, result.campaignId)).all();
    expect(campaign?.status).toBe("done");
    const queued = db.select().from(deliveries).all();
    expect(queued).toHaveLength(0);
  });
});

describe("events partial unique index (click replay dedupe)", () => {
  it("rejects a second clicked event for the same delivery", () => {
    const { db } = createMemoryDb();
    const wsId = Number(db.insert(workspaces).values({ name: "W" }).run().lastInsertRowid);
    const domainId = Number(db.insert(domains).values({ name: "x.io", workspace_id: wsId }).run().lastInsertRowid);

    db.insert(events).values({ domain_id: domainId, delivery_id: 7, type: "clicked" }).run();
    expect(() =>
      db.insert(events).values({ domain_id: domainId, delivery_id: 7, type: "clicked" }).run(),
    ).toThrow(/UNIQUE/);

    // other event types still allow duplicates with the same delivery
    db.insert(events).values({ domain_id: domainId, delivery_id: 7, type: "delivered" }).run();
    db.insert(events).values({ domain_id: domainId, delivery_id: 7, type: "delivered" }).run();
  });
});
