import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "@pushpanel/db";
import { automations, domains, workspaces } from "@pushpanel/db/schema";
import { runAutomations, MAX_CONSECUTIVE_FAILURES, FAILURE_RETRY_MINUTES, itemGuid, pickNewestChangedItem } from "../src/automation.js";

type Db = ReturnType<typeof createMemoryDb>["db"];

const BASE = new Date("2026-01-01T00:00:00.000Z");
const MIN = 60_000;

function setup() {
  const { db } = createMemoryDb();
  const [ws] = db.insert(workspaces).values({ name: "ws", slug: "ws" }).returning().all();
  const [domain] = db
    .insert(domains)
    .values({ workspace_id: ws!.id, name: "a.example.test", status: "active" })
    .returning()
    .all();
  return { db, ws: ws!, domain: domain! };
}

function insertAutomation(
  db: Db,
  opts: { type: string; domainId?: number; nextRunAt?: Date; config?: Record<string, unknown>; consecutiveFailures?: number },
) {
  return db
    .insert(automations)
    .values({
      workspace_id: 1,
      domain_id: opts.domainId ?? null,
      type: opts.type,
      name: "auto",
      config_json: JSON.stringify({
        payload: { title: "hello" },
        interval_minutes: 15,
        ...opts.config,
      }),
      audience_json: JSON.stringify({ kind: "all" }),
      status: "active",
      next_run_at: (opts.nextRunAt ?? new Date(BASE.getTime() - MIN)).toISOString(),
      consecutive_failures: opts.consecutiveFailures ?? 0,
    })
    .returning({ id: automations.id })
    .all()[0]!.id;
}

function row(db: Db, id: number) {
  return db
    .select({
      status: automations.status,
      consecutive_failures: automations.consecutive_failures,
      next_run_at: automations.next_run_at,
      error: automations.error,
    })
    .from(automations)
    .where(eq(automations.id, id))
    .all()[0]!;
}

describe("runAutomations auto-pause", () => {
  it("increments the failure counter, then pauses after the max consecutive failures", async () => {
    const { db } = setup();
    const id = insertAutomation(db, { type: "automagic_dynamic" }); // domain_id null => deterministic failure

    for (let i = 1; i <= MAX_CONSECUTIVE_FAILURES; i++) {
      const stats = await runAutomations(db, new Date(BASE.getTime() + i * (FAILURE_RETRY_MINUTES * MIN + MIN)));
      expect(stats.ran).toBe(1);
      expect(stats.failed).toBe(1);
    }

    const after = row(db, id);
    expect(after.consecutive_failures).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(after.status).toBe("paused");
    expect(after.next_run_at).toBeNull();
    expect(after.error).toContain(`Auto-paused after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
  });

  it("keeps a failing automation active below the threshold but retries soon instead of after the full interval", async () => {
    const { db } = setup();
    const id = insertAutomation(db, { type: "automagic_dynamic" });

    await runAutomations(db, new Date(BASE.getTime() + MIN));
    const once = row(db, id);
    expect(once.status).toBe("active");
    expect(once.consecutive_failures).toBe(1);
    expect(once.next_run_at).toBe(new Date(BASE.getTime() + MIN + FAILURE_RETRY_MINUTES * MIN).toISOString());
    expect(once.error).toBe("No domain assigned");
  });

  it("resets the counter and clears the error on success", async () => {
    const { db, domain } = setup();
    const id = insertAutomation(db, {
      type: "welcome_push",
      domainId: domain!.id,
      consecutiveFailures: 2,
      nextRunAt: new Date(BASE.getTime() - MIN),
    });

    const stats = await runAutomations(db, BASE);
    expect(stats.ran).toBe(1);
    expect(stats.ok).toBe(1);

    const after = row(db, id);
    expect(after.consecutive_failures).toBe(0);
    expect(after.error).toBeNull();
    expect(after.status).toBe("active");
    expect(after.next_run_at).toBeNull(); // event-driven types do not re-arm
  });
});

describe("rss_push dedupe helpers", () => {
  it("itemGuid prefers guid, then id, then link", () => {
    expect(itemGuid({ guid: "g", id: "i", link: "l" })).toBe("g");
    expect(itemGuid({ id: "i", link: "l" })).toBe("i");
    expect(itemGuid({ link: "l" })).toBe("l");
    expect(itemGuid({ isoDate: "2026-01-01" })).toBe("2026-01-01");
  });

  it("returns the newest item when nothing was sent yet or the key changed", () => {
    const items = [{ guid: "a" }, { guid: "b" }];
    expect(pickNewestChangedItem(items)?.guid).toBe("a");
    expect(pickNewestChangedItem(items, "old")?.guid).toBe("a");
  });

  it("returns null when the newest item was already sent", () => {
    expect(pickNewestChangedItem([{ guid: "a" }], "a")).toBeNull();
    expect(pickNewestChangedItem([], "a")).toBeNull();
    expect(pickNewestChangedItem([], undefined)).toBeNull();
  });

  it("fires once on first poll even with an empty last key", () => {
    expect(pickNewestChangedItem([{ guid: "a" }], "")?.guid).toBe("a");
  });
});

describe("runAutomations crontab scheduling (C3)", () => {
  it("re-arms to the next crontab fire time after a successful run", async () => {
    const { db, domain } = setup();
    const id = insertAutomation(db, {
      type: "automagic_static",
      domainId: domain!.id,
      config: { schedule_cron: "0 9 * * *", rotation_json: JSON.stringify([{ title: "tip" }]) },
    });

    const stats = await runAutomations(db, new Date("2026-01-01T10:00:00.000Z"));
    expect(stats.ran).toBe(1);
    expect(stats.ok).toBe(1);

    const after = row(db, id);
    expect(after.status).toBe("active");
    expect(after.consecutive_failures).toBe(0);
    expect(after.next_run_at).toBe(new Date(2026, 0, 2, 9, 0, 0).toISOString()); // next 09:00 local
  });
});