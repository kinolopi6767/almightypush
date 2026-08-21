"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { emailCampaigns } from "@pushpanel/db/schema";
import { renderBlocksToHtml, emailCampaignSchema } from "@pushpanel/core";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export type EmailFormState = { ok?: boolean; error?: string; id?: number } | undefined;

export async function createEmailCampaignAction(_prev: EmailFormState, formData: FormData): Promise<NonNullable<EmailFormState>> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const blocksRaw = formData.get("blocks_json") as string | null;
  let html = (formData.get("html") as string | null) ?? "";
  if (blocksRaw) {
    try {
      const blocks = JSON.parse(blocksRaw);
      if (Array.isArray(blocks)) html = renderBlocksToHtml(blocks);
    } catch {
      void 0; // ignore malformed blocks_json — fallback to raw html
    }
  }

  const parsed = emailCampaignSchema.safeParse({
    subject: formData.get("subject"),
    preheader: formData.get("preheader") ?? "",
    html,
    blocks_json: blocksRaw ?? "",
    from_email: formData.get("from_email") ?? "",
    audience_json: formData.get("audience_json") ?? "{}",
    schedule_at: formData.get("schedule_at") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const inserted = db
    .insert(emailCampaigns)
    .values({
      workspace_id: workspaceId,
      subject: parsed.data.subject,
      preheader: parsed.data.preheader || null,
      html: parsed.data.html || null,
      blocks_json: parsed.data.blocks_json || null,
      from_email: parsed.data.from_email || null,
      audience_json: parsed.data.audience_json || "{}",
      status: parsed.data.schedule_at ? "scheduled" : "draft",
      schedule_at: parsed.data.schedule_at || null,
    })
    .run();

  const id = Number(inserted.lastInsertRowid);
  logAudit(db, { workspaceId, action: "campaign.create", entityType: "email_campaign", entityId: id, meta: { subject: parsed.data.subject } });
  revalidatePath("/dashboard/email");
  return { ok: true, id };
}

export async function deleteEmailCampaignAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;
  db.delete(emailCampaigns)
    .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.workspace_id, Number(session.user.workspaceId))))
    .run();
  revalidatePath("/dashboard/email");
}
