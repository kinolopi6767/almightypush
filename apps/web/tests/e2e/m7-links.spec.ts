import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createDomain, signInViaUi, startMockHttpServer, startWorker, type MockHttpServer } from "./helpers";

/**
 * M7 LP links suite: landing-page subscribe funnel — clicks counted,
 * subscribe counts a subscriber + redirects, skip path, force-subscribe,
 * delete tombstone (fallback target).
 */

let worker: { stop: () => Promise<void> };
let http: MockHttpServer;
let db: Database.Database;

test.beforeAll(async () => {
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
});

function linkByCode(code: string) {
  return db
    .prepare("SELECT clicks_count AS c, subscribers_count AS s, target_url AS t, force_subscribe AS f FROM lp_links WHERE code = ?")
    .get(code) as { c: number; s: number; t: string; f: number } | undefined;
}

async function createLinkViaUi(
  page: import("@playwright/test").Page,
  fields: { target: string } & Record<string, string>,
  domainId?: string,
): Promise<string> {
  await page.goto("/dashboard/links");
  await page.getByLabel("Target URL").fill(fields.target);
  if (fields.prompt_text !== undefined) await page.getByLabel("Prompt text").fill(fields.prompt_text);
  if (domainId) await page.getByLabel("Domain (for push)").selectOption(domainId);
  if (fields.deleted_target_url !== undefined) await page.getByLabel("Fallback after delete (optional)").fill(fields.deleted_target_url);
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByText(fields.target)).toBeVisible();
  return (db.prepare("SELECT code FROM lp_links WHERE target_url = ? ORDER BY id DESC LIMIT 1").get(fields.target) as { code: string }).code;
}

test("landing page counts a click and redirects on skip", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const code = await createLinkViaUi(page, {
    target: `http://127.0.0.1:${http.port}/read`,
    prompt_text: "Get our updates",
  });

  const before = linkByCode(code);
  expect(before).toBeDefined();
  const clicks0 = before!.c;

  await page.goto(`/p/${code}?dev=1`);
  await expect(page.getByRole("heading", { name: "Get our updates" })).toBeVisible();
  await expect.poll(() => linkByCode(code)!.c, { timeout: 10_000 }).toBe(clicks0 + 1);

  await page.getByRole("button", { name: "No thanks, take me there" }).click();
  await page.waitForURL(new RegExp(`127\\.0\\.0\\.1:${http.port}/read`));
  const url = new URL(page.url());
  expect(url.searchParams.get("ref")).toBe("lp");
  expect(url.searchParams.get("sub")).toBeNull();
  expect(linkByCode(code)!.s).toBe(0);
});

test("allow subscribes, counts a subscriber and redirects with sub=1", async ({ page, context }) => {
  test.setTimeout(120_000);
  page.on("console", (m) => {
    if (m.text().startsWith("lp:")) console.log("[lp-console]", m.text());
  });
  page.on("pageerror", (e) => console.log("[lp-pageerror]", e.message));
  await signInViaUi(page);
  const domainId = await createDomain(page, `lp-sub-${Date.now()}.example.test`);
  const code = await createLinkViaUi(
    page,
    { target: `http://127.0.0.1:${http.port}/go`, prompt_text: "Join our push list" },
    String(domainId),
  );

  const before = linkByCode(code);
  const clicks0 = before!.c;
  await page.goto(`/p/${code}?dev=1`);
  await expect(page.getByRole("heading", { name: "Join our push list" })).toBeVisible();
  await expect.poll(() => linkByCode(code)!.c, { timeout: 10_000 }).toBe(clicks0 + 1);

  await context.grantPermissions(["notifications"], { origin: "http://127.0.0.1:3100" });
  await page.getByRole("button", { name: "Allow notifications" }).click();

  await page.waitForURL(new RegExp(`127\\.0\\.0\\.1:${http.port}/go`), { timeout: 30_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get("sub")).toBe("1");
  await expect.poll(() => linkByCode(code)!.s, { timeout: 10_000 }).toBe(1);
});

test("force-subscribe page has no skip and subscribes automatically", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const domainId = await createDomain(page, `lp-force-${Date.now()}.example.test`);
  const target = `http://127.0.0.1:${http.port}/land`;
  await page.goto("/dashboard/links");
  await page.getByLabel("Target URL").fill(target);
  await page.getByLabel("Force subscribe (no skip option)").check();
  await page.getByLabel("Domain (for push)").selectOption(String(domainId));
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByText(target)).toBeVisible();
  const code = (db.prepare("SELECT code FROM lp_links WHERE target_url = ?").get(target) as { code: string }).code;

  await context.grantPermissions(["notifications"], { origin: "http://127.0.0.1:3100" });
  await page.goto(`/p/${code}?dev=1`);
  await expect(page.getByRole("button", { name: "No thanks, take me there" })).toHaveCount(0);
  await page.waitForURL(new RegExp(`127\\.0\\.0\\.1:${http.port}/land`), { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("sub")).toBe("1");
  await expect.poll(() => linkByCode(code)!.s, { timeout: 10_000 }).toBe(1);
});

test("dev=1 is inert for anonymous visitors (no simulated subscribe)", async ({ context }) => {
  test.setTimeout(120_000);
  // Not signed in — the /p/[code]?dev=1 backdoor must be dead.
  const domainName = `lp-anon-${Date.now()}.example.test`;
  // create the domain + link via the API layer is not available anonymously;
  // use a signed-in context to set it up, then continue anonymous on `page`.
  const setupCtx = await context.browser()!.newContext();
  const setupPage = await setupCtx.newPage();
  await signInViaUi(setupPage);
  const domainId = await createDomain(setupPage, domainName);
  await setupPage.goto("/dashboard/links");
  await setupPage.getByLabel("Target URL").fill(`http://127.0.0.1:${http.port}/anon`);
  await setupPage.getByLabel("Domain (for push)").selectOption(String(domainId));
  await setupPage.getByRole("button", { name: "Create link" }).click();
  await expect(setupPage.getByText(`http://127.0.0.1:${http.port}/anon`)).toBeVisible();
  const code = (db.prepare("SELECT code FROM lp_links WHERE target_url = ? ORDER BY id DESC LIMIT 1").get(`http://127.0.0.1:${http.port}/anon`) as { code: string }).code;
  await setupCtx.close();

  const before = linkByCode(code);
  const clicks0 = before!.c;
  const subs0 = before!.s;

  // Anonymous visitor with dev=1: no permission grant → the real (non-dev)
  // flow runs and must not count a subscriber; the click still counts.
  const anonCtx = await context.browser()!.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto(`/p/${code}?dev=1`);
  await expect(anonPage.getByRole("heading", { name: "Get notified when we publish something new" })).toBeVisible();
  await anonPage.getByRole("button", { name: "No thanks, take me there" }).click();
  await anonPage.waitForURL(new RegExp(`127\\.0\\.0\\.1:${http.port}/anon`));
  const url = new URL(anonPage.url());
  expect(url.searchParams.get("sub")).toBeNull();
  expect(linkByCode(code)!.s).toBe(subs0);
  expect(linkByCode(code)!.c).toBe(clicks0 + 1);
  await anonCtx.close();
});

test("deleting a link with a fallback keeps the code redirecting", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const fallback = `http://127.0.0.1:${http.port}/gone`;
  const target = `http://127.0.0.1:${http.port}/x`;
  const code = await createLinkViaUi(page, { target, deleted_target_url: fallback });

  await page.goto("/dashboard/links");
  // Delete uses window.confirm — accept it (Playwright default-dismisses).
  page.once("dialog", (d) => d.accept());
  await page.locator("div.rounded-xl.border.bg-card", { hasText: target }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(target)).toHaveCount(0);

  await page.goto(`/p/${code}`);
  await page.waitForURL(fallback);
});