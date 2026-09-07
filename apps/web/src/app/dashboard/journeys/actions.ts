"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { journeys } from "@pushpanel/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

function canEdit(role: string | undefined): boolean {
  const r = (role ?? "viewer").toLowerCase();
  return r === "owner" || r === "admin" || r === "editor";
}

export async function pauseJourneyAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (!canEdit(session.user.role)) return { error: "Viewers cannot manage journeys" };
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return { error: "No workspace" };
  const [row] = db
    .select({ id: journeys.id, status: journeys.status })
    .from(journeys)
    .where(and(eq(journeys.id, id), eq(journeys.workspace_id, wsId)))
    .limit(1)
    .all();
  if (!row) return { error: "Journey not found" };
  const next = row.status === "active" ? "paused" : "active";
  db.update(journeys)
    .set({ status: next, next_run_at: next === "active" ? new Date().toISOString() : null })
    .where(and(eq(journeys.id, id), eq(journeys.workspace_id, wsId)))
    .run();
  logAudit(db, { workspaceId: wsId, action: next === "active" ? "journey.resume" : "journey.pause", entityType: "journey", entityId: id });
  revalidatePath("/dashboard/journeys");
  return { ok: true };
}

export async function deleteJourneyAction(id: number): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (!canEdit(session.user.role)) return { error: "Viewers cannot manage journeys" };
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return { error: "No workspace" };
  const deleted = db
    .delete(journeys)
    .where(and(eq(journeys.id, id), eq(journeys.workspace_id, wsId)))
    .run();
  if (deleted.changes === 0) return { error: "Journey not found" };
  logAudit(db, { workspaceId: wsId, action: "journey.delete", entityType: "journey", entityId: id });
  revalidatePath("/dashboard/journeys");
  return { ok: true };
}
