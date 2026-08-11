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
 * M6 template suite: create/edit/delete saved push payloads, and a campaign
 * started from a template (pre-fill + template_id recorded + delivery).
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

async function createTemplateViaUi(
  page: import("@playwright/test").Page,
  fields: { name: string; title: string } & Record<string, string>,
): Promise<void> {
  await page.goto("/dashboard/templates");
  await page.getByLabel("Name").fill(fields.name);
  await page.getByLabel("Title").fill(fields.title);
  if (fields.message !== undefined) await page.getByLabel("Message").fill(fields.message);
  if (fields.launch_url !== undefined) await page.getByLabel("Click URL").fill(fields.launch_url);
  await page.getByRole("button", { name: "Create template" }).click();
  await expect(page.getByText(fields.name)).toBeVisible();
}

test("creating a template stores it and shows on the list", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const name = `Sale template ${Date.now()}`;
  await createTemplateViaUi(page, {
    name,
    title: "Big sale",
    message: "50% off until Sunday",
    launch_url: "https://sale.example.test/coupon",
  });

  const row = db.prepare("SELECT title, message, launch_url FROM templates WHERE name = ?").get(name) as
    | { title: string; message: string; launch_url: string }
    | undefined;
  expect(row).toMatchObject({ title: "Big sale", message: "50% off until Sunday", launch_url: "https://sale.example.test/coupon" });
});

test("editing a template replaces its payload", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const name = `Editable template ${Date.now()}`;
  await createTemplateViaUi(page, { name, title: "Old title", message: "Old message" });

  const id = (db.prepare("SELECT id FROM templates WHERE name = ?").get(name) as { id: number }).id;
  await page.goto(`/dashboard/templates/${id}`);
  await page.getByLabel("Title").fill("New title");
  await page.getByLabel("Message").fill("New message");
  await page.getByRole("button", { name: "Save template" }).click();

  await expect
    .poll(() => (db.prepare("SELECT title AS t, message AS m FROM templates WHERE id = ?").get(id) as { t: string; m: string } | undefined), {
      timeout: 10_000,
    })
    .toMatchObject({ t: "New title", m: "New message" });
});

test("a campaign started from a template pre-fills and records template_id", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const domainId = await createDomain(page, `tmpl-${suffix}.example.test`);
  await subscribeViaApi(request, mock, domainId, `t-${suffix}`, "android");

  const templateName = `Blast template ${suffix}`;
  await createTemplateViaUi(page, {
    name: templateName,
    title: "Template headline",
    message: "Template body",
    launch_url: "https://tmpl.example.test/go",
  });
  const templateId = (db.prepare("SELECT id FROM templates WHERE name = ?").get(templateName) as { id: number }).id;

  const before = mock.received.length;
  await page.goto("/dashboard/campaigns/new");
  await page.getByLabel("Start from template").selectOption(String(templateId));
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Template headline");
  await expect(page.getByLabel("Message")).toHaveValue("Template body");
  await expect(page.getByLabel("Click URL")).toHaveValue("https://tmpl.example.test/go");

  await page.getByLabel("Domain", { exact: true }).selectOption(String(domainId));
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/\d+/);

  const campaignId = Number(new URL(page.url()).pathname.split("/").pop());
  await expect
    .poll(() => (db.prepare("SELECT template_id AS t, status AS s FROM campaigns WHERE id = ?").get(campaignId) as { t: number | null; s: string } | undefined), {
      timeout: 10_000,
    })
    .toMatchObject({ t: templateId });

  await expect.poll(() => mock.received.length, { timeout: 30_000 }).toBe(before + 1);

  // deleting the template removes it from the list
  await page.goto("/dashboard/templates");
  const row = page.locator("div.rounded-xl.border.bg-card", { hasText: templateName });
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(templateName)).toHaveCount(0);
});