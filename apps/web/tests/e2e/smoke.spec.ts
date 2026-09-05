import { expect, test } from "@playwright/test";
import { signInViaUi } from "./helpers";

/**
 * M0 smoke: anonymous users are pushed to /login; the health endpoints
 * answer; sign-in works and the dashboard loads (guarded flows).
 */

test("health endpoints answer", async ({ request }) => {
  const liveness = await request.get("/api/health");
  expect(liveness.ok()).toBe(true);
  expect((await liveness.json()).ok).toBe(true);

  const readiness = await request.get("/api/health/ready");
  expect(readiness.ok()).toBe(true);
});

test("anonymous visit redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  // Middleware preserves the destination as ?callbackUrl= (dashboard-only,
  // same-origin) so post-login returns where the user was headed.
  await expect(page).toHaveURL(/\/login(\?callbackUrl=%2Fdashboard)?$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("owner can sign in and reach the dashboard", async ({ page }) => {
  test.setTimeout(90_000);
  await signInViaUi(page);
  // The redesigned dashboard uses a greeting masthead rather than a literal
  // "Dashboard" h1 — assert the greeting + URL instead.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
});
