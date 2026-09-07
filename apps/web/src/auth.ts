import { createHash } from "node:crypto";
import { verifyPasswordOrDummy, verifyTotp } from "@pushpanel/core";
import { decryptTotpSecret, encryptTotpSecret, isEncryptedTotpSecret } from "@/lib/totp-crypto";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  // Max bound: each login attempt costs one argon2id verify (~64MB) — an
  // unbounded password field is a memory/CPU DoS vector.
  password: z.string().min(1).max(256),
  totp: z.string().optional(),
});

/**
 * Session-binding fingerprint of the credential: a truncated hash of the
 * password hash + TOTP state, embedded in the JWT at sign-in and re-checked
 * against the DB on every request. Changing the password or 2FA enrollment
 * invalidates all previously issued sessions — stolen cookies die with the
 * old credential instead of surviving up to maxAge.
 */
// Password-only on purpose: toggling TOTP must NOT kill the live session
// (enabling 2FA would otherwise log the user out mid-setup). Disabling TOTP
// already requires the current password, which covers the theft scenario.
const credentialVersionOf = (u: { password_hash: string | null }) =>
  createHash("sha256").update(u.password_hash ?? "").digest("hex").slice(0, 16);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totp: {} },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Brute-force + memory-DoS guard: argon2id costs ~64MB per verify.
        // Without a throttle, credential stuffing also becomes a memory-DoS.
        // (In-memory bucket: single-process; sufficient for single-tenant.)
        try {
          const { rateLimitWithHeaders } = await import("@/lib/rate-limit");
          // No request headers available in authorize() — use a global login
          // bucket plus per-email throttle as defense in depth.
          const rlGlobal = rateLimitWithHeaders("login:global", 60, 60_000);
          if (!rlGlobal.allowed) return null;
          const emailKey = parsed.data.email.toLowerCase().slice(0, 200);
          const rlEmail = rateLimitWithHeaders(`login:email:${emailKey}`, 10, 15 * 60_000);
          if (!rlEmail.allowed) return null;
        } catch {
          // Rate limiter must never break login — fail open here (auth still enforced).
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.toLowerCase()))
          .limit(1);

        if (!(await verifyPasswordOrDummy(user?.password_hash, parsed.data.password))) return null;
        // Only a real stored hash passes above, so the account exists here.
        if (!user) return null;

        // Two-factor: the code must be present and valid when enabled.
        // Legacy plaintext secrets are migrated to encrypted form on first
        // successful use so the plaintext fallback has a finite lifetime.
        if (user.totp_enabled) {
          let secret: string | null = null;
          try {
            secret = decryptTotpSecret(user.totp_secret);
          } catch {
            secret = null;
          }
          if (!verifyTotp(secret, parsed.data.totp ?? "")) return null;
          try {
            if (user.totp_secret && !isEncryptedTotpSecret(user.totp_secret)) {
              db.update(users).set({ totp_secret: encryptTotpSecret(secret ?? "") }).where(eq(users.id, user.id)).run();
            }
          } catch {
            void 0;
          }
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          workspaceId: user.workspace_id != null ? String(user.workspace_id) : null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.workspaceId = user.workspaceId;
        // Bind this JWT to the credential state at sign-in (one extra indexed
        // read per sign-in only). A DB failure here must not break sign-in —
        // fall back to an empty fingerprint (the session() re-check still
        // applies on subsequent requests).
        try {
          const [row] = await db
            .select({ password_hash: users.password_hash })
            .from(users)
            .where(eq(users.id, Number(user.id)))
            .limit(1);
          token.cv = credentialVersionOf({ password_hash: row?.password_hash ?? null });
        } catch {
          token.cv = credentialVersionOf({ password_hash: null });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        const [row] = await db
          .select({ workspaceId: users.workspace_id, password_hash: users.password_hash, role: users.role })
          .from(users)
          .where(eq(users.id, Number(token.id)))
          .limit(1);
        // Credential changed (or user deleted) since sign-in → force a clean
        // logout. Throwing here would 500 every authed page; returning a
        // user-less session makes every page's `!session?.user` guard
        // redirect to /login instead.
        if (!row || token.cv !== credentialVersionOf({ password_hash: row.password_hash })) {
          return { ...session, user: undefined, expires: session.expires } as unknown as typeof session;
        }
        // Fail closed on role: the live DB row is authoritative (demotions
        // apply immediately), the JWT is fallback, and a role-less session is
        // a viewer — never an owner.
        session.user.role = row?.role ?? (token.role as string) ?? "viewer";
        session.user.workspaceId = row?.workspaceId != null ? String(row.workspaceId) : null;
      }
      return session;
    },
  },
});
