import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { sha256Hex, signWebhook } from "@pushpanel/core";
import {
  createDomain,
  signInViaUi,
  startMockHttpServer,
  startMockPushServer,
  startWorker,
  subscribeViaApi,
  type MockHttpServer,
  type MockPushServer,
} from "./helpers";

/**
 * M4 automation suite: welcome push on subscribe, HMAC webhook trigger for
 * push_on_publish, AutoMagic dynamic (WordPress REST mock), pause + delete.
 * The worker is started with ALLOW_PRIVATE_UPSTREAM=1 so it may fetch the
 * mock upstream on 127.0.0.1 (SSRF guard bypassed only for the e2e sandbox).
 */

let mock: MockPushServer;
let http: MockHttpServer;
let worker: { stop: () => Promise<void> };
let db: Database.Database;

test.beforeAll(async () => {
  process.env.ALLOW_PRIVATE_UPSTREAM = "1";
  mock = await startMockPushServer();
  http = await startMockHttpServer();
  worker = await startWorker();
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) throw new Error("E2E_DB_PATH not set");
  db = new Database(dbPath, { readonly: true });
});

test.afterAll(async () => {
  db?.close();
  await worker?.stop();
  await http?.close();
  await mock?.close();
});

async function createAutomationViaUi(
  page: import("@playwright/test").Page,
  fields: { name: string; type: string; domainId: string; title: string } & Record<string, string>,
): Promise<void> {
  await page.goto("/dashboard/automations");
  await page.getByRole("button", { name: "New automation" }).click();
  await page.getByLabel("Name").fill(fields.name);
  await page.getByLabel("Type").selectOption(fields.type);
  if (fields.domainId) await page.getByLabel("Domain").selectOption(fields.domainId);
  await page.getByLabel("Notification title").fill(fields.title);
  if (fields.message) await page.getByLabel("Message").fill(fields.message);
  if (fields.launch_url) await page.getByLabel("Launch URL").fill(fields.launch_url);
  if (fields.delay_seconds !== undefined) await page.getByLabel("Delay (seconds)").fill(fields.delay_seconds);
  if (fields.interval_minutes !== undefined) await page.getByLabel("Interval (minutes)").fill(fields.interval_minutes);
  if (fields.source_url !== undefined) await page.getByLabel("WordPress site URL").fill(fields.source_url);
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByText(fields.name)).toBeVisible();
}

function countCampaigns(domainId: number, title?: string): number {
  const row = db
    .prepare(title ? "SELECT COUNT(*) AS n FROM campaigns WHERE domain_id = ? AND title = ?" : "SELECT COUNT(*) AS n FROM campaigns WHERE domain_id = ?")
    .get(title ? [domainId, title] : [domainId]) as { n: number };
  return row.n;
}

test("welcome push fires on the first subscribe", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `auto-${Date.now()}.example.test`);

  await createAutomationViaUi(page, {
    name: `Welcome note ${Date.now()}`,
    type: "welcome_push",
    domainId: String(domainId),
    title: "Welcome aboard",
    message: "Thanks for joining",
  });

  await subscribeViaApi(request, mock, domainId, "welcome-1");

  await expect
    .poll(() => mock.received.length, { timeout: 30_000, intervals: [500, 1000] })
    .toBeGreaterThanOrEqual(1);
  expect(mock.received.find((r) => r.path === "/push/welcome-1")?.path).toBe("/push/welcome-1");

  await expect.poll(() => countCampaigns(domainId, "Welcome aboard"), { timeout: 10_000 }).toBe(1);
  const delivery = db.prepare("SELECT status FROM deliveries WHERE domain_id = ?").all(domainId) as { status: string }[];
  expect(delivery).toHaveLength(1);
  await expect
    .poll(() => db.prepare("SELECT status FROM deliveries WHERE domain_id = ?").get(domainId), { timeout: 10_000 })
    .toMatchObject({ status: "sent" });
});

test("delayed welcome push targets only the new subscriber", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `welcome-late-${Date.now()}.example.test`);

  await createAutomationViaUi(page, {
    name: `Late welcome ${Date.now()}`,
    type: "welcome_push",
    domainId: String(domainId),
    title: "Welcome later",
    message: "You are the one",
    delay_seconds: "5",
  });

  const lateA = `welcome-late-a-${Date.now()}`;
  const lateB = `welcome-late-b-${Date.now()}`;
  const endpointOf = (label: string) => `https://127.0.0.1:${mock.port}/push/${label}`;

  await subscribeViaApi(request, mock, domainId, lateA);

  // the delayed campaign is created for exactly this subscriber
  await expect.poll(() => countCampaigns(domainId, "Welcome later"), { timeout: 10_000 }).toBe(1);
  const campaignId = (db.prepare("SELECT id FROM campaigns WHERE domain_id = ? AND title = 'Welcome later'").get(domainId) as { id: number }).id;
  // it is scheduled (delay 5s) — wait for the scheduler to start it and
  // enqueue a delivery aimed only at the new subscriber
  await expect
    .poll(
      () => {
        const rows = db
          .prepare("SELECT d.campaign_id AS c, s.token_hash AS h FROM deliveries d JOIN subscribers s ON s.id = d.subscriber_id WHERE d.campaign_id = ?")
          .all(campaignId) as { c: number; h: string }[];
        return rows.length === 1 && rows[0]!.h === sha256Hex(endpointOf(lateA)) ? 1 : 0;
      },
      { timeout: 20_000 },
    )
    .toBe(1);

  // it delivers only to the new subscriber
  await expect.poll(() => mock.received.some((r) => r.path === `/push/${lateA}`), { timeout: 30_000, intervals: [500, 1000] }).toBe(true);
  expect(mock.received.some((r) => r.path === `/push/${lateB}`)).toBe(false);

  // a second subscriber gets its own campaign aimed only at it
  await subscribeViaApi(request, mock, domainId, lateB);
  await expect.poll(() => countCampaigns(domainId, "Welcome later"), { timeout: 10_000 }).toBe(2);
  // again the scheduler starts it after the delay — wait for both deliveries
  await expect
    .poll(
      () => {
        const rows = db
          .prepare(
            "SELECT d.campaign_id AS c, s.token_hash AS h FROM deliveries d JOIN subscribers s ON s.id = d.subscriber_id WHERE d.campaign_id IN (SELECT id FROM campaigns WHERE domain_id = ? AND title = 'Welcome later') ORDER BY d.campaign_id",
          )
          .all(domainId) as { c: number; h: string }[];
        return rows.length === 2 && rows.map((r) => r.h).sort().join() === [sha256Hex(endpointOf(lateA)), sha256Hex(endpointOf(lateB))].sort().join() ? 1 : 0;
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  await expect.poll(() => mock.received.some((r) => r.path === `/push/${lateB}`), { timeout: 30_000, intervals: [500, 1000] }).toBe(true);
});

test("webhook trigger runs push_on_publish automation", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `alerts-${Date.now()}.example.test`);
  await subscribeViaApi(request, mock, domainId, "webhook-1");

  const name = `Publish alerts ${Date.now()}`;
  await createAutomationViaUi(page, {
    name,
    type: "push_on_publish",
    domainId: String(domainId),
    title: "Publish alert",
    message: "A new post went live",
  });

  const before = mock.received.length;
  const row = page
    .locator(".rounded-xl.border.bg-card", { hasText: name })
    .locator('[data-testid^="webhook-secret-"]');
  const secret = (await row.textContent()) ?? "";
  expect(secret.length).toBeGreaterThanOrEqual(16);

  const id = Number((await row.getAttribute("data-testid"))!.replace("webhook-secret-", ""));
  const body = JSON.stringify({ published: true });
  const res = await request.post(`/api/v1/automations/${id}/trigger`, {
    data: body,
    headers: {
      "X-PushPanel-Signature": `sha256=${signWebhook(secret, body)}`,
      "X-PushPanel-Timestamp": String(Date.now()),
      "content-type": "application/json",
    },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).ok).toBe(true);

  await expect.poll(() => countCampaigns(domainId, "Publish alert"), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => mock.received.length, { timeout: 30_000 }).toBe(before + 1);

  // bad signature is rejected and requires an active automation
  const bad = await request.post(`/api/v1/automations/${id}/trigger`, {
    data: body,
    headers: { "X-PushPanel-Signature": "sha256=deadbeef", "X-PushPanel-Timestamp": String(Date.now()) },
  });
  expect(bad.status()).toBe(401);
});

test("automagic dynamic fetches the newest posts and sends one", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `blog-${Date.now()}.example.test`);
  await subscribeViaApi(request, mock, domainId, "blog-1");

  http.responses.set("default", {
    status: 200,
    body: [
      { title: { rendered: "WP Post A" }, excerpt: { rendered: "<p>Excerpt A</p>" }, link: "https://blog.test/p/a" },
      { title: { rendered: "WP Post B" }, excerpt: { rendered: "<p>Excerpt B</p>" }, link: "https://blog.test/p/b" },
    ],
  });

  const before = mock.received.length;
  const name = `Blog pick ${Date.now()}`;
  await createAutomationViaUi(page, {
    name,
    type: "automagic_dynamic",
    domainId: String(domainId),
    title: "TODAY",
    message: "TODAY",
    interval_minutes: "15",
    source_url: `http://127.0.0.1:${http.port}`,
  });

  // the pick lands as a campaign (random one of the two posts) and is delivered
  await expect
    .poll(() => {
      const row = db.prepare("SELECT COUNT(*) AS n FROM campaigns WHERE domain_id = ? AND title IN ('WP Post A', 'WP Post B')").get(domainId) as { n: number };
      return row.n;
    }, { timeout: 30_000 })
    .toBe(1);
  await expect.poll(() => mock.received.length, { timeout: 30_000 }).toBe(before + 1);

  const titles = db.prepare("SELECT title FROM campaigns WHERE domain_id = ? AND title IN ('WP Post A', 'WP Post B')").all(domainId) as { title: string }[];
  expect(titles).toHaveLength(1);
  expect(["WP Post A", "WP Post B"]).toContain(titles[0]!.title);
});

test("pause blocks both webhook and run-now; delete removes the automation", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `pause-${Date.now()}.example.test`);

  const pauseName = `Pauseable alerts ${Date.now()}`;
  await createAutomationViaUi(page, {
    name: pauseName,
    type: "push_on_publish",
    domainId: String(domainId),
    title: "Pauseable alert",
    message: "Paused",
  });

  const publishRow = page.locator(".rounded-xl.border.bg-card", { hasText: pauseName });
  await publishRow.getByRole("button", { name: "Pause" }).click();
  await expect(publishRow.getByRole("button", { name: "Resume" })).toBeVisible();

  const before = mock.received.length;
  const secretEl = publishRow.locator('[data-testid^="webhook-secret-"]');
  const secret = (await secretEl.textContent()) ?? "";
  const id = Number((await secretEl.getAttribute("data-testid"))!.replace("webhook-secret-", ""));
  const body = JSON.stringify({ published: true });
  const res = await request.post(`/api/v1/automations/${id}/trigger`, {
    data: body,
    headers: {
      "X-PushPanel-Signature": `sha256=${signWebhook(secret, body)}`,
      "X-PushPanel-Timestamp": String(Date.now()),
    },
  });
  expect(res.status()).toBe(409);
  await expect.poll(() => mock.received.length, { timeout: 10_000 }).toBe(before);

  // Run now hidden for paused automations (and never for welcome types)
  await expect(publishRow.getByRole("button", { name: "Run now" })).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await publishRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(pauseName)).toHaveCount(0);
});