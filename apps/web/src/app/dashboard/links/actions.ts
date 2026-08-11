"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { lpLinks, domains } from "@pushpanel/db/schema";
import { logAudit } from "@/lib/audit";

export type LinkFormState = { ok?: boolean; error?: string };

const linkSchema = z.object({
  target_url: z.string().trim().url("Enter a valid target URL"),
  prompt_text: z.string().trim().max(120).optional().or(z.literal("")),
  force_subscribe: z.coerce.number().int().min(0).max(1).default(0),
  domain_id: z.coerce.number().int().positive().optional(),
  deleted_target_url: z.string().trim().url().optional().or(z.literal("")),
});

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

export async function createLinkAction(_prev: LinkFormState | undefined, formData: FormData): Promise<LinkFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = linkSchema.safeParse({
    target_url: formData.get("target_url"),
    prompt_text: formData.get("prompt_text"),
    force_subscribe: formData.get("force_subscribe") ?? "0",
    domain_id: (formData.get("domain_id") as string | null) || undefined,
    deleted_target_url: formData.get("deleted_target_url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid link" };

  // The landing page renders that domain's VAPID public key and attributes
  // subscribes to it — a link may only target one of the workspace's own
  // domains.
  let domainId: number | null = null;
  if (parsed.data.domain_id) {
    const [domain] = db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.id, parsed.data.domain_id), eq(domains.workspace_id, workspaceId)))
      .limit(1)
      .all();
    if (!domain) return { error: "Domain not found" };
    domainId = domain.id;
  }

  const code = makeCode();
  db.insert(lpLinks)
    .values({
      workspace_id: workspaceId,
      code,
      target_url: parsed.data.target_url,
      prompt_text: parsed.data.prompt_text || null,
      force_subscribe: parsed.data.force_subscribe,
      domain_id: domainId,
      deleted_target_url: parsed.data.deleted_target_url || null,
    })
    .run();
  logAudit(db, { workspaceId, action: "link.create", entityType: "link", meta: { code } });
  revalidatePath("/dashboard/links");
  return { ok: true };
}

export async function deleteLinkAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;

  const [row] = db
    .select({ id: lpLinks.id, deleted_target_url: lpLinks.deleted_target_url })
    .from(lpLinks)
    .where(and(eq(lpLinks.id, id), eq(lpLinks.workspace_id, Number(session.user.workspaceId))))
    .limit(1)
    .all();

  if (row?.deleted_target_url) {
    // Tombstone: keep the code but point it at the fallback target.
    db.update(lpLinks)
      .set({ target_url: row.deleted_target_url, force_subscribe: 0, prompt_text: null, deleted_at: new Date().toISOString() })
      .where(eq(lpLinks.id, id))
      .run();
  } else {
    db.delete(lpLinks).where(eq(lpLinks.id, id)).run();
  }
  logAudit(db, { workspaceId: Number(session.user.workspaceId), action: "link.delete", entityType: "link", entityId: id });
  revalidatePath("/dashboard/links");
}

export type Link = {
  id: number;
  code: string;
  target_url: string;
  prompt_text: string | null;
  force_subscribe: number;
  clicks_count: number;
  subscribers_count: number;
};

export async function listLinks(): Promise<Link[]> {
  const session = await auth();
  if (!session?.user?.workspaceId) return [];
  return db
    .select({
      id: lpLinks.id,
      code: lpLinks.code,
      target_url: lpLinks.target_url,
      prompt_text: lpLinks.prompt_text,
      force_subscribe: lpLinks.force_subscribe,
      clicks_count: lpLinks.clicks_count,
      subscribers_count: lpLinks.subscribers_count,
    })
    .from(lpLinks)
    .where(and(eq(lpLinks.workspace_id, Number(session.user.workspaceId)), isNull(lpLinks.deleted_at)))
    .orderBy(lpLinks.created_at)
    .all();
}