import { createHash } from "node:crypto";
import { verifyPassword, verifyTotp } from "@pushpanel/core";
import { decryptTotpSecret } from "@/lib/totp-crypto";
import { db } from "@/lib/db";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.toLowerCase()))
          .limit(1);

        if (!user?.password_hash) return null;
        const ok = await verifyPassword(user.password_hash, parsed.data.password);
        if (!ok) return null;

        // Two-factor: the code must be present and valid when enabled.
        if (user.totp_enabled) {
          const secret = decryptTotpSecret(user.totp_secret);
          if (!verifyTotp(secret, parsed.data.totp ?? "")) return null;
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
        // read per sign-in only).
        const [row] = await db
          .select({ password_hash: users.password_hash })
          .from(users)
          .where(eq(users.id, Number(user.id)))
          .limit(1);
        token.cv = credentialVersionOf({ password_hash: row?.password_hash ?? null });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "owner";
        const [row] = await db
          .select({ workspaceId: users.workspace_id, password_hash: users.password_hash })
          .from(users)
          .where(eq(users.id, Number(token.id)))
          .limit(1);
        // Credential changed (or user deleted) since sign-in → invalidate.
        if (!row) throw new Error("Session invalidated — user missing");
        if (token.cv !== credentialVersionOf({ password_hash: row.password_hash })) {
          throw new Error("Session invalidated — credentials changed");
        }
        session.user.workspaceId = row?.workspaceId != null ? String(row.workspaceId) : null;
      }
      return session;
    },
  },
});
