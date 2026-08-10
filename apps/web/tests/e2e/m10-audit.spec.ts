import { expect, test } from "@playwright/test";
import { createDomain, signInViaUi } from "./helpers";

/**
 * M10 audit log suite: panel actions append entries that appear on the
 * settings page.
 */

test("creating a domain and a segment records audit entries", async ({ page }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const hostname = `audit-${suffix}.example.test`;
  await createDomain(page, hostname);

  const segName = `Audit segment ${suffix}`;
  await page.goto("/dashboard/segments");
  await page.getByLabel("Name").fill(segName);
  await page.getByLabel("Condition 1.1 field").selectOption("device");
  await page.getByLabel("Condition 1.1 value").fill("android");
  await page.getByRole("button", { name: "Create segment" }).click();
  await expect(page.locator("div.rounded-xl.border.bg-card", { hasText: segName })).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText("domain.create", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("segment.create", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/domain #\d+/).first()).toBeVisible();
});

test("cancel a campaign records campaign.cancel", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUi(page);
  const suffix = String(Date.now());
  const domainId = await createDomain(page, `audit-cmp-${suffix}.example.test`);

  await page.goto("/dashboard/campaigns/new");
  await page.getByLabel("Domain", { exact: true }).selectOption(String(domainId));
  await page.getByLabel("Title").fill(`Audit blast ${suffix}`);
  await page.getByLabel("Schedule (optional)").fill("2030-01-01T00:00");
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns\/\d+/);
  await page.getByRole("button", { name: /cancel campaign/i }).click();
  await expect(page.getByText("Campaign cancelled.")).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByText("campaign.create", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("campaign.cancel", { exact: false }).first()).toBeVisible();
});