import { expect, test } from "@playwright/test";

/**
 * M0 smoke: anonymous users are pushed to /login; the health endpoints
 * answer; after first-run setup the dashboard loads (guarded flows).
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
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test("first-run setup flow creates owner and signs in", async ({ page }) => {
  // POST /api/auth/signout clears any stale session first.
  await page.request.post("/api/auth/signout", { form: {} }).catch(() => undefined);

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: /set up pushpanel/i })).toBeVisible();

  const email = `owner-${Date.now()}@test.io`;
  await page.getByLabel("Name").fill("Test Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("s3cure-password-123");

  // Setup redirects to /login after creation (no auto sign-in yet).
  // Sign in with the created credentials.
  await page.getByRole("button", { name: /setup/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("s3cure-password-123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});