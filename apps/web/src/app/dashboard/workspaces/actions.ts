"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workspaces, users } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, hyphens only")
    .min(2)
    .max(40)
    .optional()
    .or(z.literal("")),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function createWorkspaceAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const parsed = createSchema.safeParse({ name: formData.get("name"), slug: formData.get("slug") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const slug = (parsed.data.slug || slugify(parsed.data.name)) || `ws-${Date.now()}`;
  try {
    const inserted = db.insert(workspaces).values({ name: parsed.data.name, slug }).run();
    const newId = Number(inserted.lastInsertRowid);
    // Switch the creator to the new workspace immediately
    db.update(users).set({ workspace_id: newId }).where(eq(users.id, Number(session.user.id))).run();
    revalidatePath("/dashboard/workspaces");
    revalidatePath("/dashboard");
    return { ok: true, id: newId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE") || msg.includes("unique")) return { error: "Slug already taken — try another" };
    return { error: "Could not create workspace" };
  }
}

export async function switchWorkspaceAction(workspaceId: number) {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const wsId = Number(workspaceId);
  if (!Number.isInteger(wsId) || wsId <= 0) return { error: "Invalid workspace" };
  const [ws] = db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, wsId)).limit(1).all();
  if (!ws) return { error: "Workspace not found" };
  db.update(users).set({ workspace_id: wsId }).where(eq(users.id, Number(session.user.id))).run();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/workspaces");
  return { ok: true };
}
