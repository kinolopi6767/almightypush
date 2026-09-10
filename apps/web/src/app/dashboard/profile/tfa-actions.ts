"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { generateTotpSecret, totpUri, verifyPassword, verifyTotp } from "@pushpanel/core";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { decryptTotpSecret, encryptTotpSecret } from "@/lib/totp-crypto";

export type TfaState = { ok?: boolean; error?: string; secret?: string; uri?: string } | undefined;

async function currentUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const [user] = db.select({ id: users.id, email: users.email, password_hash: users.password_hash, totp_secret: users.totp_secret, totp_enabled: users.totp_enabled }).from(users).where(eq(users.email, email)).limit(1).all();
  return user ?? null;
}

/** Stage 1: verify the password, then generate + persist a secret (not yet enabled). */
export async function enableTfaStartAction(_prev: TfaState, formData: FormData): Promise<NonNullable<TfaState>> {
  if (!rateLimit(`tfa:${clientIp(await headers())}`, 10, 60_000)) {
    return { error: "Too many attempts — try again later" };
  }
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };
  // Never clobber an active enrollment silently — an attacker with a stolen
  // session must not be able to swap the TOTP secret unnoticed.
  if (user.totp_enabled) return { error: "2FA is already enabled — disable it first (password required)" };
  // Password-gated enrollment: minting a secret is account-takeover-shaped
  // (secret → attacker's authenticator → confirmed enrollment locks the real
  // owner out), so a hijacked session alone must not reach it.
  if (!user.password_hash) return { error: "Account has no password set" };
  // Cap before argon2: an unbounded body would burn ~64MB per verify.
  const rawPassword = formData.get("password");
  if (typeof rawPassword !== "string" || rawPassword.length === 0 || rawPassword.length > 256) {
    return { error: "Enter your current password to set up 2FA" };
  }
  if (!(await verifyPassword(user.password_hash, rawPassword))) {
    return { error: "Enter your current password to set up 2FA" };
  }

  const secret = generateTotpSecret();
  db.update(users)
    .set({ totp_secret: encryptTotpSecret(secret), totp_enabled: 0 })
    .where(eq(users.id, user.id))
    .run();

  return { ok: true, secret, uri: totpUri(secret, user.email) };
}

/** Stage 2: confirm the code read from the authenticator app. */
export async function enableTfaConfirmAction(_prev: TfaState, formData: FormData): Promise<NonNullable<TfaState>> {
  // TOTP codes are 6 digits — without a throttle this is brute-forceable
  // (~26%/month at 30 tries/15min with a ±1-step window). 10/min/IP plus the
  // per-account bucket below keeps guessing infeasible.
  if (!rateLimit(`tfa:${clientIp(await headers())}`, 10, 60_000)) {
    return { error: "Too many attempts — try again later" };
  }
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };
  if (!rateLimit(`tfa:acct:${user.id}`, 10, 15 * 60_000)) {
    return { error: "Too many attempts — try again later" };
  }

  const code = z.string().regex(/^\d{6}$/).safeParse(formData.get("code"));
  if (!code.success) return { error: "Enter the 6-digit code" };
  const secret = decryptTotpSecret(user.totp_secret);
  if (!secret || !verifyTotp(secret, code.data)) return { error: "Invalid code — check your authenticator app" };

  db.update(users)
    .set({ totp_enabled: 1 })
    .where(eq(users.id, user.id))
    .run();
  await tfaAudit(user.id, "profile.totp.enabled");
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

async function tfaAudit(userId: number, action: "profile.totp.enabled" | "profile.totp.disabled"): Promise<void> {
  const session = await auth();
  const workspaceId = session?.user?.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return;
  logAudit(db, { workspaceId, userId, action });
}

export async function disableTfaAction(_prev: TfaState, formData: FormData): Promise<NonNullable<TfaState>> {
  if (!rateLimit(`tfa:${clientIp(await headers())}`, 10, 60_000)) {
    return { error: "Too many attempts — try again later" };
  }
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };

  // Disabling 2FA is a security downgrade — require the current password so
  // a hijacked session alone cannot strip the second factor.
  if (!user.password_hash) return { error: "Account has no password set" };
  const rawPassword = formData.get("password");
  if (typeof rawPassword !== "string" || rawPassword.length === 0 || rawPassword.length > 256) {
    return { error: "Enter your current password to disable 2FA" };
  }
  if (!(await verifyPassword(user.password_hash, rawPassword))) {
    return { error: "Enter your current password to disable 2FA" };
  }

  db.update(users)
    .set({ totp_secret: null, totp_enabled: 0 })
    .where(eq(users.id, user.id))
    .run();
  await tfaAudit(user.id, "profile.totp.disabled");
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

export async function tfaStatusAction(): Promise<{ enabled: boolean }> {
  const user = await currentUser();
  return { enabled: Boolean(user?.totp_enabled) };
}
