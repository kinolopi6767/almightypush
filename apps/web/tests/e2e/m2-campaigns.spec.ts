import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  createDomain,
  localDateTime,
  signInViaUi,
  startMockPushServer,
  startWorker,
  subscribeViaApi,
  type MockPushServer,
} from "./helpers";

/**
 * M2 vertical slice: scheduled campaigns → scheduler enqueue → worker
 * delivery → stats → cancel. The scheduler only runs inside the worker
 * process, so these tests exercise the full stack (UI form → server action →
 * worker tick → SQLite).
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

test("send-now campaign: UI → scheduler → delivery → stats", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, "campaigns.example.test");
  await subscribeViaApi(request, mock, domainId, "campaign-1");

  // --- create the campaign through the UI ---
  await page.goto("/dashboard/campaigns");
  await page.getByRole("link", { name: /new campaign/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/new/);
  await page.getByLabel("Domain").selectOption(String(domainId));
  await page.getByLabel("Title").fill("Big sale this weekend");
  await page.getByLabel("Message").fill("Everything is 50% off.");
  await page.getByLabel("Click URL").fill("https://campaigns.example.test/sale");
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/\d+/);
  const campaignId = Number(new URL(page.url()).pathname.split("/").pop());

  // --- the scheduler starts it and the worker delivers to the mock ---
  await expect.poll(() => mock.received.length, { timeout: 30_000 }).toBe(1);
  const push = mock.received[0]!;
  expect(push.path).toBe("/push/campaign-1");

  await expect
    .poll(
      () => {
        const row = db
          .prepare("SELECT status FROM campaigns WHERE id = ?")
          .get(campaignId) as { status: string } | undefined;
        return row?.status;
      },
      { timeout: 10_000 },
    )
    .toBe("done");

  // --- detail page reflects the delivery ---
  await page.goto(`/dashboard/campaigns/${campaignId}`);
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/statuses right now: sent 1/i)).toBeVisible();

  // --- click beacon records the click ---
  const delivery = db
    .prepare("SELECT id FROM deliveries WHERE campaign_id = ?")
    .get(campaignId) as { id: number };
  const click = await request.get(`/api/v1/click/${delivery.id}`, { maxRedirects: 0 });
  expect(click.status()).toBe(302);

  await expect
    .poll(() => {
      const row = db
        .prepare("SELECT count(*) AS n FROM events WHERE campaign_id = ? AND type = 'clicked'")
        .get(campaignId) as { n: number };
      return row.n;
    })
    .toBe(1);

  // --- the campaigns list shows the summary ---
  await page.goto("/dashboard/campaigns");
  const row = page.getByRole("link", { name: /Big sale this weekend/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/1 delivered · 1 clicks/i);
});

test("future campaign stays scheduled until its time, then cancels", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, "scheduled.example.test");
  await subscribeViaApi(request, mock, domainId, "scheduled-1");
  const pushesBefore = mock.received.length;

  // --- schedule an hour out ---
  await page.goto("/dashboard/campaigns/new");
  await page.getByLabel("Domain").selectOption(String(domainId));
  await page.getByLabel("Title").fill("Flash sale tomorrow");
  await page.getByLabel("Schedule (optional)").fill(localDateTime(3_600_000));
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/\d+/);
  const campaignId = Number(new URL(page.url()).pathname.split("/").pop());

  // --- it must not be started: no deliveries, still scheduled after a few ticks ---
  await page.waitForTimeout(4_000);
  await expect(page.getByText("scheduled", { exact: true })).toBeVisible();
  expect(mock.received.length).toBe(pushesBefore);
  expect(
    db.prepare("SELECT count(*) AS n FROM deliveries WHERE campaign_id = ?").get(campaignId) as { n: number },
  ).toEqual({ n: 0 });

  // --- cancel it ---
  await page.getByRole("button", { name: /cancel campaign/i }).click();
  await expect(page.getByText("Campaign cancelled.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
  expect(
    db.prepare("SELECT status FROM campaigns WHERE id = ?").get(campaignId) as { status: string },
  ).toEqual({ status: "cancelled" });
});
