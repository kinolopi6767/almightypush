"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { templates } from "@pushpanel/db/schema";
import { logAudit } from "@/lib/audit";

export type TemplateFormState = { ok?: boolean; error?: string };

const templateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  title: z.string().trim().min(1, "Title is required").max(120),
  message: z.string().trim().max(500).optional().or(z.literal("")),
  icon_url: z.string().trim().url().optional().or(z.literal("")),
  image_url: z.string().trim().url().optional().or(z.literal("")),
  launch_url: z.string().trim().url().optional().or(z.literal("")),
});

export async function createTemplateAction(_prev: TemplateFormState | undefined, formData: FormData): Promise<TemplateFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    title: formData.get("title"),
    message: formData.get("message"),
    icon_url: formData.get("icon_url"),
    image_url: formData.get("image_url"),
    launch_url: formData.get("launch_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template" };

  db.insert(templates)
    .values({
      workspace_id: workspaceId,
      name: parsed.data.name,
      title: parsed.data.title,
      message: parsed.data.message || null,
      icon_url: parsed.data.icon_url || null,
      image_url: parsed.data.image_url || null,
      launch_url: parsed.data.launch_url || null,
    })
    .run();
  logAudit(db, { workspaceId, action: "template.create", entityType: "template", meta: { name: parsed.data.name } });
  revalidatePath("/dashboard/templates");
  return { ok: true };
}

export async function updateTemplateAction(id: number, formData: FormData): Promise<TemplateFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    title: formData.get("title"),
    message: formData.get("message"),
    icon_url: formData.get("icon_url"),
    image_url: formData.get("image_url"),
    launch_url: formData.get("launch_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template" };

  db.update(templates)
    .set({
      name: parsed.data.name,
      title: parsed.data.title,
      message: parsed.data.message || null,
      icon_url: parsed.data.icon_url || null,
      image_url: parsed.data.image_url || null,
      launch_url: parsed.data.launch_url || null,
    })
    .where(and(eq(templates.id, id), eq(templates.workspace_id, workspaceId)))
    .run();
  logAudit(db, { workspaceId, action: "template.update", entityType: "template", entityId: id, meta: { name: parsed.data.name } });
  revalidatePath("/dashboard/templates");
  return { ok: true };
}

export async function deleteTemplateAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;

  db.delete(templates)
    .where(and(eq(templates.id, id), eq(templates.workspace_id, Number(session.user.workspaceId))))
    .run();
  logAudit(db, { workspaceId: Number(session.user.workspaceId), action: "template.delete", entityType: "template", entityId: id });
  revalidatePath("/dashboard/templates");
}