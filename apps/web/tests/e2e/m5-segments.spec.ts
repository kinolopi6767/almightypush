import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  createDomain,
  signInViaUi,
  startMockPushServer,
  startWorker,
  subscribeViaApi,
  type MockPushServer,
} from "./helpers";

/**
 * M5 segment suite: rule builder estimate, create via UI, edit, and a
 * segment-targeted campaign that delivers only to matching subscribers.
 */

let mock: MockPushServer;
let worker: { stop: () => Promise<void> };
let db: Database.Database;

test.beforeAll(async () => {
  mock = await startMockPushServer();
  worker = await startWorker();
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) throw new Error("E2E_DB_PATH not set");
  db = new Database(dbPath, { readonly: true });
});

test.afterAll(async () => {
  db?.close();
  await worker?.stop();
  await mock?.close();
});

/** Fills the single-condition builder on /dashboard/segments. */
async function buildCondition(page: import("@playwright/test").Page, field: string, op: string, value: string): Promise<void> {
  await page.getByLabel("Condition 1.1 field").selectOption(field);
  await page.getByLabel("Condition 1.1 operator").selectOption(op);
  await page.getByLabel("Condition 1.1 value").fill(value);
}

function segmentEstimate(name: string): number | null {
  const row = db
    .prepare("SELECT estimate_count AS n FROM segments WHERE name = ? ORDER BY id DESC LIMIT 1")
    .get(name) as { n: number | null } | undefined;
  return row?.n ?? null;
}

test("segment builder estimates and creates a segment via the UI", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const domainId = await createDomain(page, `seg-${suffix}.example.test`);
  await subscribeViaApi(request, mock, domainId, `android-${suffix}`, "android");
  await subscribeViaApi(request, mock, domainId, `android2-${suffix}`, "android");
  await subscribeViaApi(request, mock, domainId, `iphone-${suffix}`, "iphone");

  const name = `Android users ${suffix}`;
  await page.goto("/dashboard/segments");
  await page.getByLabel("Name").fill(name);
  await buildCondition(page, "device", "equals", "android");
  await page.getByRole("button", { name: "Estimate", exact: true }).click();
  await expect(page.getByText("~2 subscribers")).toBeVisible();
  await page.getByRole("button", { name: "Create segment" }).click();

  await expect(page.locator("div.rounded-xl.border.bg-card", { hasText: name })).toContainText("~2 subs");
  await expect.poll(() => segmentEstimate(name), { timeout: 10_000 }).toBe(2);

  const row = db
    .prepare("SELECT conditions_json AS c FROM segments WHERE name = ? ORDER BY id DESC LIMIT 1")
    .get(name) as { c: string };
  expect(JSON.parse(row.c)).toMatchObject({
    groups: [{ logic: "AND", conditions: [{ field: "device", op: "equals", value: "android" }] }],
  });
});

test("editing a segment re-estimates against the new rules", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const domainId = await createDomain(page, `seg-edit-${suffix}.example.test`);
  await subscribeViaApi(request, mock, domainId, `e-android-${suffix}`, "android");
  await subscribeViaApi(request, mock, domainId, `e-iphone-${suffix}`, "iphone");

  const name = `Editable ${suffix}`;
  await page.goto("/dashboard/segments");
  await page.getByLabel("Name").fill(name);
  await page.getByText(`seg-edit-${suffix}.example.test`, { exact: true }).click();
  await buildCondition(page, "device", "equals", "android");
  await page.getByRole("button", { name: "Create segment" }).click();
  await expect(page.locator("div.rounded-xl.border.bg-card", { hasText: name })).toBeVisible();

  const id = (db.prepare("SELECT id FROM segments WHERE name = ? ORDER BY id DESC LIMIT 1").get(name) as { id: number }).id;
  await page.goto(`/dashboard/segments/${id}`);
  await page.getByLabel("Condition 1.1 value").fill("iphone");
  await page.getByRole("button", { name: "Save segment" }).click();

  await expect.poll(() => segmentEstimate(name), { timeout: 10_000 }).toBe(1);
  await page.goto("/dashboard/segments");
  await expect(page.locator("div.rounded-xl.border.bg-card", { hasText: name })).toContainText("~1 subs");
});

test("a segment-targeted campaign delivers only to matching subscribers", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const domainId = await createDomain(page, `seg-camp-${suffix}.example.test`);
  await subscribeViaApi(request, mock, domainId, `c-android-${suffix}`, "android");
  await subscribeViaApi(request, mock, domainId, `c-iphone-${suffix}`, "iphone");

  const segName = `Campaign audience ${suffix}`;
  await page.goto("/dashboard/segments");
  await page.getByLabel("Name").fill(segName);
  await page.getByText(`seg-camp-${suffix}.example.test`, { exact: true }).click();
  await buildCondition(page, "device", "equals", "android");
  await page.getByRole("button", { name: "Create segment" }).click();
  await expect(page.locator("div.rounded-xl.border.bg-card", { hasText: segName })).toBeVisible();

  const segId = (db.prepare("SELECT id FROM segments WHERE name = ? ORDER BY id DESC LIMIT 1").get(segName) as { id: number }).id;
  const title = `Segmented blast ${suffix}`;
  const before = mock.received.length;

  await page.goto("/dashboard/campaigns/new");
  await page.getByLabel("Domain", { exact: true }).selectOption(String(domainId));
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Message").fill("Only android gets this");
  await page.getByText("A saved segment", { exact: true }).click();
  await page.getByLabel("Segment", { exact: true }).selectOption(String(segId));
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/\d+/);

  const campaignId = Number(new URL(page.url()).pathname.split("/").pop());
  await expect
    .poll(
      () => {
        const devices = db
          .prepare(
            "SELECT s.device AS device FROM deliveries d JOIN subscribers s ON s.id = d.subscriber_id WHERE d.campaign_id = ?",
          )
          .all(campaignId) as { device: string }[];
        return devices.map((d) => d.device);
      },
      { timeout: 30_000, intervals: [500, 1000] },
    )
    .toEqual(["android"]);

  await expect.poll(() => mock.received.length, { timeout: 30_000 }).toBe(before + 1);
  expect(mock.received.some((r) => r.path === `/push/c-android-${suffix}`)).toBe(true);
  expect(mock.received.some((r) => r.path === `/push/c-iphone-${suffix}`)).toBe(false);

  const count = (db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE campaign_id = ?").get(campaignId) as { n: number }).n;
  expect(count).toBe(1);
});
