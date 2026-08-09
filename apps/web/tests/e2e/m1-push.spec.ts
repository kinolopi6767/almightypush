import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  browserKeys,
  signInViaUi,
  startMockPushServer,
  startWorker,
  type MockPushServer,
} from "./helpers";

/**
 * M1 vertical slice: subscribe → campaign → worker delivery → click beacon.
 * The SDK's subscribe call is posted directly (headless Chromium cannot talk
 * to a real push service); everything else runs through the real stack —
 * UI forms, server actions, worker loop and API routes — against a shared
 * ephemeral SQLite DB and a TLS mock push service (web-push is HTTPS-only).
 */

let mock: MockPushServer;
let worker: { stop: () => Promise<void> };
let db: Database.Database;
let domainId: number;

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

test("sandbox push loop: subscribe → test push → worker delivery → click beacon", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);

  // --- create a domain through the panel UI (generates the VAPID keypair) ---
  await page.goto("/dashboard/domains");
  await page.getByLabel("Hostname").fill("sandbox.example.test");
  await page.getByRole("button", { name: /create domain/i }).click();
  await page.waitForURL(/\/dashboard\/domains\/\d+/);
  domainId = Number(new URL(page.url()).pathname.split("/").pop());

  // --- /api/v1/info exposes the public key for the SDK ---
  const info = await request.get(`/api/v1/info?domain=${domainId}`);
  expect(info.ok()).toBe(true);
  const infoJson = await info.json();
  expect(infoJson.publicKey).toMatch(/^[A-Za-z0-9_-]{80,90}$/);

  // --- SDK-equivalent subscribe against the mock push service ---
  const subscribe = await request.post("/api/v1/subscribe", {
    data: {
      domainId,
      subscription: {
        endpoint: `https://127.0.0.1:${mock.port}/push/sandbox-1`,
        keys: browserKeys(),
      },
      browser: "chromium",
      os: "linux",
    },
  });
  expect(subscribe.ok()).toBe(true);
  expect((await subscribe.json()).ok).toBe(true);

  // --- send a test push from the domain detail page ---
  await page.goto(`/dashboard/domains/${domainId}`);
  await page.getByLabel("Title").fill("Hello sandbox");
  await page.getByLabel("Message").fill("End-to-end delivery");
  await page.getByLabel("Click URL").fill("https://sandbox.example.test/post/1");
  await page.getByRole("button", { name: /send test push/i }).click();
  await expect(page.getByText(/queued 1 push/i)).toBeVisible();

  // --- the worker picks the queued delivery up and reaches the mock service ---
  await expect
    .poll(() => mock.received.length, { timeout: 30_000, intervals: [500, 1000] })
    .toBe(1);
  const push = mock.received[0]!;
  expect(push.path).toBe("/push/sandbox-1");
  expect(push.body.length).toBeGreaterThan(0);
  expect(JSON.stringify(push.headers)).toMatch(/authorization/);

  // --- delivery settles as `sent` and the campaign finishes ---
  await expect
    .poll(
      () => {
        const row = db.prepare("SELECT status FROM deliveries").get() as { status: string } | undefined;
        return row?.status;
      },
      { timeout: 10_000 },
    )
    .toBe("sent");
  await expect
    .poll(
      () => {
        const row = db.prepare("SELECT status FROM campaigns").get() as { status: string } | undefined;
        return row?.status;
      },
      { timeout: 10_000 },
    )
    .toBe("done");

  // --- click beacon: records the click and redirects to the campaign URL ---
  const delivery = db.prepare("SELECT id, campaign_id FROM deliveries").get() as { id: number; campaign_id: number };
  const click = await request.get(`/api/v1/click/${delivery.id}`, { maxRedirects: 0 });
  expect(click.status()).toBe(302);
  expect(click.headers()["location"]).toBe("https://sandbox.example.test/post/1");

  const clickEvent = db
    .prepare("SELECT type, meta_json FROM events WHERE campaign_id = ? AND type = 'clicked'")
    .get(delivery.campaign_id) as { type: string; meta_json: string } | undefined;
  expect(clickEvent?.meta_json).toContain("sandbox.example.test/post/1");

  // --- dashboard reflects the counts ---
  await page.goto("/dashboard");
  const cards = page.locator(".grid > div");
  await expect(cards.filter({ hasText: "Subscribers" })).toContainText("1");
  await expect(cards.filter({ hasText: "Domains" })).toContainText("1");
  await expect(cards.filter({ hasText: "Clicks" })).toContainText("1");
});

test("subscribe is rejected for unknown domains", async ({ request }) => {
  const res = await request.post("/api/v1/subscribe", {
    data: {
      domainId: 999_999,
      subscription: {
        endpoint: `https://127.0.0.1:${mock.port}/push/ghost`,
        keys: browserKeys(),
      },
    },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).ok).toBe(false);
});

test("click beacon 404s for unknown deliveries", async ({ request }) => {
  const res = await request.get("/api/v1/click/999999", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
});
