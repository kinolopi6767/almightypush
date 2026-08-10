import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { totpCode } from "@pushpanel/core";
import { signInViaUi, OWNER_EMAIL, OWNER_PASSWORD } from "./helpers";

/**
 * M11 two-factor suite: enable TOTP on the profile page, then sign-in
 * requires a code (wrong code rejected, right code accepted, disable restores
 * password-only login).
 */

let db: Database.Database;

test.beforeAll(async () => {
  const dbPath = process.env.E2E_DB_PATH;
  if (!dbPath) throw new Error("E2E_DB_PATH not set");
  db = new Database(dbPath, { readonly: false });
});

test.afterAll(async () => {
  db?.close();
});

function totpEnabled(): number {
  return (db.prepare("SELECT totp_enabled AS e FROM users WHERE email = ?").get(OWNER_EMAIL) as { e: number }).e;
}

test("enable 2FA, code-gated sign-in, and disable restores password login", async ({ page }) => {
  test.setTimeout(180_000);
  await signInViaUi(page);

  // --- enable from the profile page ---
  await page.goto("/dashboard/profile");
  await expect(page.getByText("Two-factor authentication")).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const uriText = await page.locator("code").filter({ hasText: "otpauth://" }).textContent();
  expect(uriText).toContain("secret=");
  const secret = /secret=([A-Z2-7]+)/.exec(uriText!)![1]!;
  const code = totpCode(secret);

  await page.getByLabel("Verify code").fill(code);
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText("Enabled — sign-in requires a 6-digit code.")).toBeVisible();
  await expect.poll(() => totpEnabled(), { timeout: 10_000 }).toBe(1);

  // --- sign out, then password alone must NOT log in (code gate) ---
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // staged: the form now asks for the code
  await expect(page.getByLabel("Authentication code")).toBeVisible();

  // wrong code → error
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByText("Invalid email, password or code")).toBeVisible();

  // right code → dashboard
  await page.getByLabel("Authentication code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.waitForURL(/\/dashboard/);

  // --- disable 2FA ---
  await page.goto("/dashboard/profile");
  await page.getByRole("button", { name: "Disable 2FA" }).click();
  await expect(page.getByText("Add a time-based one-time password")).toBeVisible();
  await expect.poll(() => totpEnabled(), { timeout: 10_000 }).toBe(0);

  // password-only login works again
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
});