"use server";

import { hashPassword } from "@pushpanel/core";
import { db } from "@/lib/db";
import { workspaces, users } from "@pushpanel/db/schema";
import { count } from "drizzle-orm";
import { z } from "zod";
import type { AuthFormState } from "@/app/(auth)/actions";

const setupSchema = z.object({
  name: z.string().trim().min(1).default("Owner"),
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

/**
 * First-run bootstrap: creates the owner account + workspace.
 * Only works while no users exist; sign-up is permanently disabled after.
 */
export async function setupAction(_prev: AuthFormState, formData: FormData): Promise<NonNullable<AuthFormState>> {
  const parsed = setupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [row] = await db.select({ value: count() }).from(users);
  if ((row?.value ?? 0) > 0) return { error: "Already set up — sign in instead" };

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  // better-sqlite3 driver: everything inside db.transaction is synchronous.
  db.transaction((tx) => {
    const inserted = tx.insert(workspaces).values({ name: "My Workspace", slug: "main" }).run();
    if (!inserted.lastInsertRowid) throw new Error("Failed to create workspace");

    tx.insert(users)
      .values({
        email,
        name: parsed.data.name,
        password_hash: passwordHash,
        role: "owner",
        workspace_id: Number(inserted.lastInsertRowid),
      })
      .run();
  });

  return { ok: true };
}