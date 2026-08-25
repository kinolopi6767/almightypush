import { test } from "@playwright/test";
import { signInViaUi } from "./helpers";

const PAGES = [
  ["dashboard", "/dashboard"],
  ["domains", "/dashboard/domains"],
  ["campaigns", "/dashboard/campaigns"],
  ["analytics", "/dashboard/analytics"],
  ["segments", "/dashboard/segments"],
  ["templates", "/dashboard/templates"],
  ["links", "/dashboard/links"],
  ["channels", "/dashboard/channels"],
  ["automations", "/dashboard/automations"],
  ["journeys", "/dashboard/journeys"],
  ["email", "/dashboard/email"],
  ["ai", "/dashboard/ai"],
  ["status", "/dashboard/status"],
  ["api", "/dashboard/api"],
  ["guides", "/dashboard/guides"],
  ["team", "/dashboard/team"],
  ["settings", "/dashboard/settings"],
  ["profile", "/dashboard/profile"],
  ["workspaces", "/dashboard/workspaces"],
];

test.describe.configure({ mode: "serial" });

test("capture all pages", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await signInViaUi(page);

  for (const [name, path] of PAGES) {
    await page.goto(path);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/tmp/ui/${name}-light.png`, fullPage: true });

    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/ui/${name}-dark.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(200);
  }
  await page.close();

  // Mobile
  const mp = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await signInViaUi(mp);
  for (const [name, path] of PAGES.slice(0, 8)) {
    await mp.goto(path);
    await mp.waitForTimeout(500);
    await mp.screenshot({ path: `/tmp/ui/${name}-mobile.png`, fullPage: true });
  }
  await mp.close();
});
