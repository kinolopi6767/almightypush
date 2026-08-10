"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { verifyPassword, verifyTotp } from "@pushpanel/core";
import { clientIp, envRateLimit, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export type AuthFormState = { error?: string; ok?: boolean } | undefined;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOGIN_LIMIT = () => envRateLimit("LOGIN_RATE_LIMIT", 10);
const LOGIN_WINDOW_MS = 60_000;

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<NonNullable<AuthFormState>> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, LOGIN_LIMIT(), LOGIN_WINDOW_MS)) {
    return { error: "Too many attempts — try again in a minute" };
  }
  // Verify first so failures surface as inline errors instead of a NextAuth
  // redirect to /login?error=... (v5 throws NEXT_REDIRECT on failures too).
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1), totp: z.string().optional() })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      totp: (formData.get("totp") as string | null) ?? undefined,
    });
  if (!parsed.success) return { error: "Invalid email, password or code" };

  const [user] = await db
    .select({ password_hash: users.password_hash, totp_secret: users.totp_secret, totp_enabled: users.totp_enabled })
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1);
  if (!user?.password_hash) return { error: "Invalid email, password or code" };
  if (!(await verifyPassword(user.password_hash, parsed.data.password))) {
    return { error: "Invalid email, password or code" };
  }
  if (user.totp_enabled && !verifyTotp(user.totp_secret ?? "", parsed.data.totp ?? "")) {
    return { error: "Invalid email, password or code" };
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      totp: (formData.get("totp") as string | null) ?? undefined,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    // Successful sign-ins throw NEXT_REDIRECT — let it propagate.
    if (error instanceof AuthError) {
      return { error: "Invalid email, password or code" };
    }
    throw error;
  }
  return { ok: true };
}

export type TotpCheckState = { needsTotp?: boolean; error?: string } | undefined;

/**
 * Stage 1 of sign-in: verify the password only (no session). Returns whether
 * a TOTP code is required for the second stage.
 */
export async function checkTotpAction(_prev: TotpCheckState, formData: FormData): Promise<NonNullable<TotpCheckState>> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, LOGIN_LIMIT(), LOGIN_WINDOW_MS)) {
    return { error: "Too many attempts — try again in a minute" };
  }
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  const [user] = await db
    .select({ id: users.id, password_hash: users.password_hash, totp_enabled: users.totp_enabled })
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1);
  if (!user?.password_hash) return { error: "Invalid email or password" };
  const ok = await verifyPassword(user.password_hash, parsed.data.password);
  if (!ok) return { error: "Invalid email or password" };

  return { needsTotp: Boolean(user.totp_enabled) };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}