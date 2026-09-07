import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@pushpanel/db";
import { emailCampaigns, emailContacts, journeys, journeyRuns, workspaces } from "@pushpanel/db/schema";
import { runJourneys } from "./journey";
import { runEmailCampaigns } from "./email";

function seedWorkspace(db: Parameters<typeof runJourneys>[0]): number {
  const ws = db.insert(workspaces).values({ name: "WS", slug: "ws-claims" }).run();
  return Number(ws.lastInsertRowid);
}

describe("journey worker claim", () => {
  it("runs a due journey once — the immediate next tick finds nothing to do", async () => {
    const { db, client } = createMemoryDb();
    const workspaceId = seedWorkspace(db);
    db.insert(journeys)
      .values({
        workspace_id: workspaceId,
        name: "Welcome",
        status: "active",
        trigger_type: "subscribe",
        canvas_json: "{}",
        next_run_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .run();

    const first = await runJourneys(db);
    expect(first).toEqual({ ran: 1, ok: 1, failed: 0 });

    // The claim moved next_run_at forward (+15min): without the in-claim
    // advance, a concurrent worker/tick would fire the journey twice.
    const second = await runJourneys(db);
    expect(second).toEqual({ ran: 0, ok: 0, failed: 0 });
    // The stub runner re-arms but records no run rows: writing 'sent' rows
    // for journeys that sent nothing would fabricate analytics history.
    expect(db.select({ id: journeyRuns.id }).from(journeyRuns).all()).toHaveLength(0);
    client.close();
  });
});

describe("email campaign claim", () => {
  it("claims scheduled→sending so a second worker cannot double-send", () => {
    const { db, client } = createMemoryDb();
    const workspaceId = seedWorkspace(db);
    db.insert(emailContacts).values({ workspace_id: workspaceId, email: "a@example.com", status: "subscribed" }).run();
    db.insert(emailCampaigns)
      .values({
        workspace_id: workspaceId,
        subject: "Hello",
        status: "scheduled",
        schedule_at: new Date(Date.now() - 60_000).toISOString(),
        audience_json: "{}",
      })
      .run();

    const first = runEmailCampaigns(db);
    expect(first.started).toBe(1);
    expect(first.sent).toBe(1);

    // Already done — no second send even if another worker polls late.
    const second = runEmailCampaigns(db);
    expect(second).toEqual({ started: 0, sent: 0 });

    const [campaign] = db.select({ status: emailCampaigns.status }).from(emailCampaigns).all();
    expect(campaign?.status).toBe("done");
    client.close();
  });

  it("dedupes manual audience ids (no double count)", () => {
    const { db, client } = createMemoryDb();
    const workspaceId = seedWorkspace(db);
    const c1 = db.insert(emailContacts).values({ workspace_id: workspaceId, email: "a@example.com", status: "subscribed" }).run();
    const id1 = Number(c1.lastInsertRowid);
    db.insert(emailCampaigns)
      .values({
        workspace_id: workspaceId,
        subject: "Hello",
        status: "scheduled",
        schedule_at: new Date(Date.now() - 60_000).toISOString(),
        audience_json: JSON.stringify({ kind: "manual", ids: [id1, id1, id1] }),
      })
      .run();

    const first = runEmailCampaigns(db);
    expect(first.started).toBe(1);
    // Dedupe: 3 copies of the same id count once.
    expect(first.sent).toBe(1);
    client.close();
  });
});
