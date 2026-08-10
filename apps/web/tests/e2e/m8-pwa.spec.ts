import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

/**
 * M8 PWA suite: installable manifest served, iOS "Add to Home Screen" hint
 * shows on iPhone Safari and dismisses.
 */

test("manifest is served with install metadata", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.name).toBe("PushPanel");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons.length).toBeGreaterThan(0);

  for (const icon of manifest.icons) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.status()).toBe(200);
  }
});

test("root layout links the manifest and apple meta tags", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
});

test("iOS Safari shows the install hint, desktop does not", async ({ browser }) => {
  const ios = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const iosPage = await ios.newPage();
  await signInViaUi(iosPage);
  await expect(iosPage.getByText("Install PushPanel")).toBeVisible();

  await iosPage.getByRole("button", { name: "Got it" }).click();
  await expect(iosPage.getByText("Install PushPanel")).toHaveCount(0);

  // Reload in the same context — the hint must stay dismissed this session.
  await iosPage.reload();
  await expect(iosPage.getByText("Install PushPanel")).toHaveCount(0);
  await ios.close();

  const desktop = await browser.newContext();
  const desktopPage = await desktop.newPage();
  await signInViaUi(desktopPage);
  await expect(desktopPage.getByText("Install PushPanel")).toHaveCount(0);
  await desktop.close();
});