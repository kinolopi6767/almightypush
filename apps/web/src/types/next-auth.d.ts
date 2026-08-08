import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    name?: string | null;
    role: string;
    workspaceId: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      workspaceId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    workspaceId?: string | null;
  }
}

export {};
