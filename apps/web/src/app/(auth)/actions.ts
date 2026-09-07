"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { verifyPasswordOrDummy } from "@pushpanel/core";
import { clientIp, envRateLimit, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export type AuthFormState = { error?: string; ok?: boolean } | undefined;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const LOGIN_LIMIT = () => envRateLimit("LOGIN_RATE_LIMIT", 10);
const LOGIN_WINDOW_MS = 60_000;
/** Account-level window — defeats per-IP rotation against a single account. */
const ACCOUNT_WINDOW_MS = 15 * 60_000;
const ACCOUNT_LIMIT = () => envRateLimit("ACCOUNT_RATE_LIMIT", 30);

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<NonNullable<AuthFormState>> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, LOGIN_LIMIT(), LOGIN_WINDOW_MS)) {
    return { error: "Too many attempts — try again in a minute" };
  }
  // Verify first so failures surface as inline errors instead of a NextAuth
  // redirect to /login?error=... (v5 throws NEXT_REDIRECT on failures too).
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1).max(256), totp: z.string().optional() })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      totp: (formData.get("totp") as string | null) ?? undefined,
    });
  if (!parsed.success) return { error: "Invalid email, password or code" };

  const email = parsed.data.email.toLowerCase();
  if (!rateLimit(`login:acct:${email}`, ACCOUNT_LIMIT(), ACCOUNT_WINDOW_MS)) {
    return { error: "Too many attempts — try again later" };
  }

  // Single argon2 verify: the Credentials authorize() callback in auth.ts
  // performs the (timing-equalized) password + TOTP check. A pre-verify here
  // would double the ~64MB argon2 cost per attempt (DoS amplification), so
  // this action only rate-limits and delegates — AuthError maps to the same
  // generic inline error.
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

  const email = parsed.data.email.toLowerCase();
  if (!rateLimit(`login:acct:${email}`, ACCOUNT_LIMIT(), ACCOUNT_WINDOW_MS)) {
    return { error: "Too many attempts — try again later" };
  }

  const [user] = await db
    .select({ id: users.id, password_hash: users.password_hash, totp_enabled: users.totp_enabled })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Timing-equalized: a missing account costs one argon2 verify, same as a
  // wrong password, so emails can't be enumerated by latency.
  const ok = await verifyPasswordOrDummy(user?.password_hash, parsed.data.password);
  if (!ok) return { error: "Invalid email or password" };

  return { needsTotp: Boolean(user?.totp_enabled) };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}