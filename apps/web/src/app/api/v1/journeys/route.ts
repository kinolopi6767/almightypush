import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { journeys } from "@pushpanel/db/schema";
import { requireEditorRole } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger_type: z.enum(["subscribe", "rss", "event", "api", "inactivity"]).default("api"),
  canvas_json: z.string().max(100_000).optional().or(z.literal("")),
  domain_id: z.coerce.number().int().positive().optional(),
});

/**
 * POST /api/v1/journeys — minimal journey creation.
 *
 * The dashboard Journeys page referenced this endpoint but it did not exist
 * (404). The worker's journey runner is still a stub (it logs + re-arms), so
 * created journeys are stored as draft/active rows and executed once the
 * runner lands. Contract is intentionally small: name + trigger + canvas.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return NextResponse.json({ ok: false, error: "No workspace" }, { status: 400 });
  const roleErr = requireEditorRole(session.user.role);
  if (roleErr) return NextResponse.json({ ok: false, error: roleErr }, { status: 403 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  let canvas = parsed.data.canvas_json || "{}";
  try {
    const c = JSON.parse(canvas) as unknown;
    if (!c || typeof c !== "object") canvas = "{}";
  } catch {
    return NextResponse.json({ ok: false, error: "canvas_json must be valid JSON" }, { status: 400 });
  }

  const inserted = db
    .insert(journeys)
    .values({
      workspace_id: wsId,
      domain_id: parsed.data.domain_id ?? null,
      name: parsed.data.name,
      status: "draft",
      canvas_json: canvas,
      trigger_type: parsed.data.trigger_type,
      trigger_config_json: "{}",
      stats_json: "{}",
    })
    .run();
  const id = Number(inserted.lastInsertRowid);
  logAudit(db, { workspaceId: wsId, action: "journey.create", entityType: "journey", entityId: id, meta: { name: parsed.data.name } });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
