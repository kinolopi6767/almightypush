import { test } from "@playwright/test";
import { signInViaUi } from "./helpers";
test.setTimeout(180_000);
test("capture remaining", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await signInViaUi(page);
  const pages = [
    ["settings", "/dashboard/settings"],
    ["team", "/dashboard/team"],
    ["guides", "/dashboard/guides"],
    ["status", "/dashboard/status"],
    ["api", "/dashboard/api"],
    ["profile", "/dashboard/profile"],
    ["automations", "/dashboard/automations"],
    ["email", "/dashboard/email"],
    ["journeys", "/dashboard/journeys"],
    ["workspaces", "/dashboard/workspaces"],
  ];
  for (const [name, path] of pages) {
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
});
