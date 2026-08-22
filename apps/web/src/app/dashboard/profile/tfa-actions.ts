"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { generateTotpSecret, totpUri, verifyPassword, verifyTotp } from "@pushpanel/core";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
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

/** Stage 1: generate + persist a secret (not yet enabled). */
export async function enableTfaStartAction(): Promise<NonNullable<TfaState>> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };
  // Never clobber an active enrollment silently — an attacker with a stolen
  // session must not be able to swap the TOTP secret unnoticed.
  if (user.totp_enabled) return { error: "2FA is already enabled — disable it first (password required)" };

  const secret = generateTotpSecret();
  db.update(users)
    .set({ totp_secret: encryptTotpSecret(secret), totp_enabled: 0 })
    .where(eq(users.id, user.id))
    .run();

  return { ok: true, secret, uri: totpUri(secret, user.email) };
}

/** Stage 2: confirm the code read from the authenticator app. */
export async function enableTfaConfirmAction(_prev: TfaState, formData: FormData): Promise<NonNullable<TfaState>> {
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };

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
  const user = await currentUser();
  if (!user) return { error: "Not signed in" };

  // Disabling 2FA is a security downgrade — require the current password so
  // a hijacked session alone cannot strip the second factor.
  if (!user.password_hash) return { error: "Account has no password set" };
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(user.password_hash, password))) {
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
