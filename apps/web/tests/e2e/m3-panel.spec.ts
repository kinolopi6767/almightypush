import { expect, test } from "@playwright/test";
import { createDomain, signInViaUi, startMockPushServer, subscribeViaApi } from "./helpers";
import type { MockPushServer } from "./helpers";

/**
 * M3: panel admin — subscriber management (list, filter, clean, import/export),
 * settings (timezone + retention), backups, and profile (name + password).
 */

let mock: MockPushServer;

test.beforeAll(async () => {
  mock = await startMockPushServer();
});

test.afterAll(async () => {
  await mock?.close();
});

test("subscribers page: list, filter, clean unsubscribed", async ({ page, request }) => {
  test.setTimeout(180_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, "subs.m3.test");

  await subscribeViaApi(request, mock, domainId, "subs-1", "desktop");
  await subscribeViaApi(request, mock, domainId, "subs-2", "mobile");

  const unsub = await request.post("/api/v1/unsubscribe", {
    data: { domainId, endpoint: `https://127.0.0.1:${mock.port}/push/subs-2` },
  });
  expect(unsub.ok()).toBe(true);

  await page.goto(`/dashboard/domains/${domainId}/subscribers`);
  await expect(page).toHaveTitle(/Subscribers/);
  await expect(page.getByText("1 active · 1 unsubscribed · 2 total")).toBeVisible();
  await expect(page.getByText(/desktop/).first()).toBeVisible();
  await expect(page.getByText(/mobile/).first()).toBeVisible();
  await expect(page.getByText(/unsubscribed · api/)).toBeVisible();

  // search by device
  await page.getByPlaceholder("Search browser, OS, device, country…").fill("mobile");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("1 active · 1 unsubscribed · 2 total")).toBeVisible();
  await expect(page.getByText(/unsubscribed · api/)).toBeVisible();
  await expect(page.getByText(/desktop/)).not.toBeVisible();

  // status filter
  await page.getByPlaceholder("Search browser, OS, device, country…").fill("");
  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText(/desktop/).first()).toBeVisible();
  await expect(page.getByText(/unsubscribed · api/)).not.toBeVisible();

  // clean unsubscribed
  await page.getByLabel("Status").selectOption("all");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("1 active · 1 unsubscribed · 2 total")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clean unsubscribed" }).click();
  await expect(page.getByText("Removed 1 unsubscribed subscriber.")).toBeVisible();
  await expect(page.getByText("1 active · 0 unsubscribed · 1 total")).toBeVisible();
});

test("subscribers: export CSV and import from file", async ({ page, request }) => {
  test.setTimeout(180_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, "transfer.m3.test");

  await subscribeViaApi(request, mock, domainId, "export-me", "desktop");
  await page.goto(`/dashboard/domains/${domainId}/subscribers`);

  // export → CSV includes the decrypted endpoint
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv.split("\n")[0]).toBe("id,endpoint,browser,os,device,country,state,subscribe_url,subscribe_at,last_active_at,unsubscribed_at");
  expect(csv).toContain(`https://127.0.0.1:${mock.port}/push/export-me`);

  // import: 1 new + 1 duplicate of an existing endpoint
  const existingEndpoint = `https://127.0.0.1:${mock.port}/push/export-me`;
  const csvImport = [
    "endpoint,p256dh,auth,browser,os,device",
    `"https://127.0.0.1:${mock.port}/push/imported-1",aaaa,bbbb,safari,ios,iphone`,
    `"${existingEndpoint}",cccc,dddd,chromium,linux,desktop`,
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvImport),
  });
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported 1, skipped 1, invalid 0.")).toBeVisible();
  await expect(page.getByText("2 active · 0 unsubscribed · 2 total")).toBeVisible();
  await expect(page.getByText("safari · ios · iphone")).toBeVisible();
});

test("settings: timezone + retention save and persist", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  await page.goto("/dashboard/settings");
  await expect(page).toHaveTitle(/Settings/);

  await page.getByLabel("Timezone").fill("Asia/Kolkata");
  await page.getByLabel("Unsubscribed retention (days)").fill("45");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Kolkata");
  await expect(page.getByLabel("Unsubscribed retention (days)")).toHaveValue("45");
});

test("backups: create, list, download valid sqlite, delete", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  await page.goto("/dashboard/settings");
  await expect(page.getByText("No backups yet.")).toBeVisible();

  await page.getByRole("button", { name: "Create backup" }).click();
  await expect(page.getByText(/Backup created \(#/)).toBeVisible();

  const row = page.locator("tbody tr").first();
  await expect(row.getByText("manual")).toBeVisible();
  await expect(row.getByText("done")).toBeVisible();

  // download via the API (request-level — UI download events are flaky under
  // the Next app router's RSC interception) and verify the SQLite magic header
  const downloadHref = await row.getByRole("link", { name: "Download" }).getAttribute("href");
  expect(downloadHref).toMatch(/^\/api\/backups\/\d+\/download$/);
  const dl = await page.request.get(downloadHref!);
  expect(dl.ok()).toBe(true);
  expect((await dl.body()).subarray(0, 15).toString()).toBe("SQLite format 3");

  // delete
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No backups yet.")).toBeVisible();
});

test("profile: update name and password, re-login works", async ({ page }) => {
  test.setTimeout(180_000);
  const ORIGINAL_PASSWORD = "s3cure-password-123";
  const NEW_PASSWORD = "brand-new-password-456";

  await signInViaUi(page);
  await page.goto("/dashboard/profile");
  await expect(page).toHaveTitle(/Profile/);

  // wrong current password is rejected
  await page.getByLabel("Name").fill("M3 Profile");
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Current password is incorrect")).toBeVisible();

  // correct flow (React resets uncontrolled inputs after the failed submit —
  // re-enter the new password)
  await page.getByLabel("Current password").fill(ORIGINAL_PASSWORD);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();

  // sign out via the UI, log in with the new password
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill("e2e-owner@test.io");
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");

  // restore the original password so other specs still pass
  await page.goto("/dashboard/profile");
  await page.getByLabel("Current password").fill(NEW_PASSWORD);
  await page.getByLabel("New password").fill(ORIGINAL_PASSWORD);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
});

test("subscribers: clean requires confirmation (cancel keeps rows)", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, "nuke.m3.test");
  await subscribeViaApi(request, mock, domainId, "keep-me", "desktop");
  await request.post("/api/v1/unsubscribe", {
    data: { domainId, endpoint: `https://127.0.0.1:${mock.port}/push/keep-me` },
  });

  await page.goto(`/dashboard/domains/${domainId}/subscribers`);
  await expect(page.getByText("0 active · 1 unsubscribed · 1 total")).toBeVisible();

  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Clean unsubscribed" }).click();
  await expect(page.getByText("0 active · 1 unsubscribed · 1 total")).toBeVisible();
});
