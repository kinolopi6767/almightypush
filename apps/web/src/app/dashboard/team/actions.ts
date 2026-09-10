"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { teamInvites, users } from "@pushpanel/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { headers } from "next/headers";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { hashPassword, sha256Hex } from "@pushpanel/core";
import { randomBytes } from "node:crypto";

export type TeamFormState = { error?: string; ok?: boolean; token?: string } | undefined;

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "editor", "viewer"]),
});

function requireOwnerOrAdmin() {
  return auth().then((session) => {
    if (!session?.user) throw new Error("Not signed in");
    if (session.user.role !== "owner" && session.user.role !== "admin") throw new Error("Only owner/admin can manage team");
    const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
    if (!workspaceId) throw new Error("No workspace");
    return { session, workspaceId };
  });
}

export async function inviteTeamMemberAction(_prev: TeamFormState, formData: FormData): Promise<NonNullable<TeamFormState>> {
  let ctx: Awaited<ReturnType<typeof requireOwnerOrAdmin>>;
  try {
    ctx = await requireOwnerOrAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { workspaceId } = ctx;

  // Invite minting sends email-equivalent secrets — throttle per inviter IP so
  // a compromised owner/admin session cannot spray invites at line rate.
  if (!rateLimit(`invite:${clientIp(await headers())}`, 10, 60_000)) {
    return { error: "Too many invites — try again later" };
  }

  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Privilege escalation guard: only the INSTANCE owner may mint owner-level
  // invites (a workspace "owner" from a past invite cannot propagate the role).
  if (parsed.data.role === "owner" && !(ctx.session.user.isInstanceOwner && ctx.session.user.role === "owner")) {
    return { error: "Only the instance owner can grant owner access" };
  }

  // Noisy-but-harmless otherwise: inviting an address that already has an
  // account can never be redeemed (accept rejects existing emails), so fail
  // fast with a clear message instead of minting a dead invite.
  const emailLower = parsed.data.email.toLowerCase();
  const [existing] = db.select({ id: users.id }).from(users).where(eq(users.email, emailLower)).limit(1).all();
  if (existing) return { error: "An account with this email already exists" };

  const token = randomBytes(24).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.insert(teamInvites).values({ workspace_id: workspaceId, email: emailLower, role: parsed.data.role, token_hash: tokenHash, expires_at: expiresAt }).run();
  logAudit(db, { workspaceId, action: "team.invite", entityType: "team_invite", meta: { email: parsed.data.email, role: parsed.data.role, invited: true } });

  return { ok: true, token };
}

export async function revokeInviteAction(inviteId: number): Promise<TeamFormState> {
  try {
    const { workspaceId } = await requireOwnerOrAdmin();
    db.delete(teamInvites).where(and(eq(teamInvites.id, inviteId), eq(teamInvites.workspace_id, workspaceId))).run();
    logAudit(db, { workspaceId, action: "team.revoke", entityType: "team_invite", entityId: inviteId });
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function listInvitesAction() {
  try {
    const { workspaceId } = await requireOwnerOrAdmin();
    // Explicit columns: token_hash must never leave the server (it is a
    // credential-equivalent verifier for the invite link).
    return db
      .select({
        id: teamInvites.id,
        workspace_id: teamInvites.workspace_id,
        email: teamInvites.email,
        role: teamInvites.role,
        expires_at: teamInvites.expires_at,
        accepted_at: teamInvites.accepted_at,
        created_at: teamInvites.created_at,
      })
      .from(teamInvites)
      .where(eq(teamInvites.workspace_id, workspaceId))
      .all();
  } catch {
    return [];
  }
}

/**
 * Invite redemption: the invited person sets name + password at
 * /invite/[token]; the account is created in the inviting workspace with the
 * invited role. Token is single-use, hashed at rest, expiry-checked.
 */
const acceptSchema = z.object({
  token: z.string().min(32).max(128),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10, "Password must be at least 10 characters").max(256, "Password must be at most 256 characters"),
});

export async function acceptInviteAction(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData): Promise<{ error?: string; ok?: boolean } | undefined> {
  // Each attempt costs an argon2id hash — throttle before doing any work.
  if (!rateLimit(`invite-accept:${clientIp(await headers())}`, 10, 60_000)) {
    return { error: "Too many attempts — try again later" };
  }
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const tokenHash = sha256Hex(parsed.data.token);
  const [invite] = db.select().from(teamInvites).where(eq(teamInvites.token_hash, tokenHash)).limit(1).all();
  if (!invite) return { error: "This invite link is invalid or has already been used." };
  if (invite.accepted_at) return { error: "This invite has already been accepted." };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { error: "This invite has expired — ask the owner to send a new one." };
  }

  const email = invite.email.toLowerCase();
  const [existing] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).all();
  if (existing) return { error: "An account with this email already exists — sign in instead." };

  const passwordHash = await hashPassword(parsed.data.password);
  db.transaction((tx) => {
    tx.insert(users)
      .values({
        workspace_id: invite.workspace_id,
        email,
        name: parsed.data.name,
        password_hash: passwordHash,
        totp_enabled: 0,
        role: invite.role,
      })
      .run();
    tx.update(teamInvites)
      .set({ accepted_at: new Date().toISOString() })
      .where(eq(teamInvites.id, invite.id))
      .run();
  });

  logAudit(db, { workspaceId: invite.workspace_id, action: "team.accept", entityType: "team_invite", meta: { email, accepted: true, role: invite.role } });
  return { ok: true };
}

/** Validate an invite token for the acceptance page (no secrets returned). */
export async function getInvitePreview(token: string): Promise<{ valid: boolean; email?: string; role?: string; workspaceError?: boolean }> {
  // Unauthenticated token-guessing oracle — throttle per IP. Tokens carry
  // 192 bits of entropy, so this is defense-in-depth against DB-load probing.
  try {
    if (!rateLimit(`invite-preview:${clientIp(await headers())}`, 30, 60_000)) {
      return { valid: false };
    }
  } catch {
    // headers() unavailable (e.g. certain test harnesses) — continue without
    // the throttle rather than breaking the invite flow.
  }
  const tokenHash = sha256Hex(token);
  const [invite] = db.select().from(teamInvites).where(eq(teamInvites.token_hash, tokenHash)).limit(1).all();
  if (!invite || invite.accepted_at || (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now())) {
    return { valid: false };
  }
  return { valid: true, email: invite.email, role: invite.role };
}
