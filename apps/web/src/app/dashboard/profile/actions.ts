"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@pushpanel/core";
import { users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export type ProfileFormState = { ok?: boolean; error?: string } | undefined;

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(10, "New password must be at least 10 characters").optional().or(z.literal("")),
});

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<NonNullable<ProfileFormState>> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: "Not signed in" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const [user] = db.select({ id: users.id, password_hash: users.password_hash }).from(users).where(eq(users.email, email)).limit(1).all();
  if (!user) return { error: "Account not found" };
  if (!user.password_hash || !(await verifyPassword(user.password_hash, parsed.data.currentPassword))) {
    return { error: "Current password is incorrect" };
  }

  const changes: { name?: string; password_hash?: string } = { name: parsed.data.name };
  const newPassword = parsed.data.newPassword;
  const passwordChanged = Boolean(newPassword && newPassword.length >= 10);
  if (newPassword && newPassword.length >= 10) {
    changes.password_hash = await hashPassword(newPassword);
  }

  db.update(users)
    .set(changes)
    .where(eq(users.id, user.id))
    .run();

  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (workspaceId) {
    logAudit(db, {
      workspaceId,
      userId: user.id,
      action: "profile.update",
      meta: { password: passwordChanged ? "changed" : "unchanged" },
    });
  }

  revalidatePath("/dashboard/profile");
  return { ok: true };
}
