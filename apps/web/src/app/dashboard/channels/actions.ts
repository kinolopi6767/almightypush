"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { lpLinks, youtubeChannels } from "@pushpanel/db/schema";
import { logAudit } from "@/lib/audit";

export type ChannelFormState = { ok?: boolean; error?: string };

const channelSchema = z.object({
  channel_url: z.string().trim().url("Enter a valid YouTube URL"),
  prompt_text: z.string().trim().max(120).optional().or(z.literal("")),
  force_subscribe: z.coerce.number().int().min(0).max(1).default(0),
});

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

function channelTitleFromUrl(url: string): string {
  const u = new URL(url);
  const match = u.pathname.match(/^\/channel\/([^/]+)/) ?? u.pathname.match(/^\/@([^/]+)/);
  const handle = match?.[1] ?? "";
  return handle ? `YouTube — ${handle}` : u.hostname;
}

export async function createChannelAction(_prev: ChannelFormState | undefined, formData: FormData): Promise<ChannelFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = channelSchema.safeParse({
    channel_url: formData.get("channel_url"),
    prompt_text: formData.get("prompt_text"),
    force_subscribe: formData.get("force_subscribe") ?? "0",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid channel" };

  let hostname: string;
  try {
    hostname = new URL(parsed.data.channel_url).hostname;
  } catch {
    return { error: "Invalid channel URL" };
  }
  if (!(hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com") || hostname.endsWith(".youtu.be"))) {
    return { error: "Only YouTube channel URLs are supported" };
  }

  const code = makeCode();
  db.insert(lpLinks)
    .values({
      workspace_id: workspaceId,
      code,
      target_url: parsed.data.channel_url,
      prompt_text: parsed.data.prompt_text || null,
      force_subscribe: parsed.data.force_subscribe,
    })
    .run();
  db.insert(youtubeChannels)
    .values({
      workspace_id: workspaceId,
      title: channelTitleFromUrl(parsed.data.channel_url),
      channel_url: parsed.data.channel_url,
      prompt_text: parsed.data.prompt_text || null,
      force_subscribe: parsed.data.force_subscribe,
      lp_code: code,
      status: "active",
    })
    .run();
  logAudit(db, { workspaceId, action: "channel.create", entityType: "channel", meta: { code } });
  revalidatePath("/dashboard/channels");
  return { ok: true };
}

export async function toggleChannelAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;
  const workspaceId = Number(session.user.workspaceId);

  const [row] = db
    .select({ id: youtubeChannels.id, status: youtubeChannels.status })
    .from(youtubeChannels)
    .where(and(eq(youtubeChannels.id, id), eq(youtubeChannels.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) return;

  const status = row.status === "active" ? "paused" : "active";
  db.update(youtubeChannels).set({ status }).where(eq(youtubeChannels.id, id)).run();
  logAudit(db, { workspaceId, action: "channel.toggle", entityType: "channel", entityId: id, meta: { status } });
  revalidatePath("/dashboard/channels");
}

export async function deleteChannelAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;
  const workspaceId = Number(session.user.workspaceId);

  const [row] = db
    .select({ id: youtubeChannels.id, lp_code: youtubeChannels.lp_code })
    .from(youtubeChannels)
    .where(and(eq(youtubeChannels.id, id), eq(youtubeChannels.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) return;

  db.delete(youtubeChannels).where(eq(youtubeChannels.id, id)).run();
  if (row.lp_code) db.delete(lpLinks).where(and(eq(lpLinks.code, row.lp_code), eq(lpLinks.workspace_id, workspaceId))).run();
  logAudit(db, { workspaceId, action: "channel.delete", entityType: "channel", entityId: id });
  revalidatePath("/dashboard/channels");
}

export type Channel = {
  id: number;
  title: string | null;
  channel_url: string;
  lp_code: string | null;
  prompt_text: string | null;
  force_subscribe: number;
  clicks_count: number;
  desktop_subs: number;
  mobile_subs: number;
  status: string;
  last_video_at: string | null;
  last_polled_at: string | null;
  created_at: string;
};

export async function listChannels(): Promise<Channel[]> {
  const session = await auth();
  if (!session?.user?.workspaceId) return [];
  return db
    .select({
      id: youtubeChannels.id,
      title: youtubeChannels.title,
      channel_url: youtubeChannels.channel_url,
      lp_code: youtubeChannels.lp_code,
      prompt_text: youtubeChannels.prompt_text,
      force_subscribe: youtubeChannels.force_subscribe,
      clicks_count: youtubeChannels.clicks_count,
      desktop_subs: youtubeChannels.desktop_subs,
      mobile_subs: youtubeChannels.mobile_subs,
      status: youtubeChannels.status,
      last_video_at: youtubeChannels.last_video_at,
      last_polled_at: youtubeChannels.last_polled_at,
      created_at: youtubeChannels.created_at,
    })
    .from(youtubeChannels)
    .where(eq(youtubeChannels.workspace_id, Number(session.user.workspaceId)))
    .orderBy(youtubeChannels.id)
    .all();
}