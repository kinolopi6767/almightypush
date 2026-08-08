import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no DB, no providers). Used by the middleware via
 * NextAuth(authConfig) — the JWT-only session check must stay bundle-safe
 * for the Edge Runtime.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
} satisfies NextAuthConfig;