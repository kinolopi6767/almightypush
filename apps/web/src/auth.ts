import { verifyPassword, verifyTotp } from "@pushpanel/core";
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
          if (!verifyTotp(user.totp_secret ?? "", parsed.data.totp ?? "")) return null;
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "owner";
        const [row] = await db
          .select({ workspaceId: users.workspace_id })
          .from(users)
          .where(eq(users.id, Number(token.id)))
          .limit(1);
        session.user.workspaceId = row?.workspaceId != null ? String(row.workspaceId) : null;
      }
      return session;
    },
  },
});