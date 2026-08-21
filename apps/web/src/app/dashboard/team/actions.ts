"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { teamInvites } from "@pushpanel/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { sha256Hex } from "@pushpanel/core";
import { randomBytes } from "node:crypto";

export type TeamFormState = { error?: string; ok?: boolean; token?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "editor", "viewer"]),
});

export async function inviteTeamMemberAction(_prev: TeamFormState, formData: FormData): Promise<NonNullable<TeamFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  if (session.user.role !== "owner" && session.user.role !== "admin") return { error: "Only owner/admin can invite" };

  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const token = randomBytes(24).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.insert(teamInvites).values({ workspace_id: workspaceId, email: parsed.data.email.toLowerCase(), role: parsed.data.role, token_hash: tokenHash, expires_at: expiresAt }).run();
  logAudit(db, { workspaceId, action: "domain.create", entityType: "team_invite", meta: { email: parsed.data.email, role: parsed.data.role } });

  return { ok: true, token };
}

export async function revokeInviteAction(inviteId: number): Promise<TeamFormState> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  db.delete(teamInvites).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.workspace_id, workspaceId))).run();
  return { ok: true };
}

export async function listInvitesAction() {
  const session = await auth();
  if (!session?.user?.workspaceId) return [];
  return db.select().from(teamInvites).where(eq(teamInvites.workspace_id, Number(session.user.workspaceId))).all();
}
