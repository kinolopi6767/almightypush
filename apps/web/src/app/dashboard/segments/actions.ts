"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { segments } from "@pushpanel/db/schema";
import { estimateSegmentRules, refreshSegmentEstimate } from "@pushpanel/db";
import { logAudit } from "@/lib/audit";
import { normalizeRules, type SegmentRules } from "@pushpanel/core";

export type SegmentFormState = { ok?: boolean; error?: string };

const conditionSchema = z.object({
  field: z.enum(["url", "country", "state", "device", "os", "browser", "subscribed_after", "subscribed_before", "last_active_after", "opened_campaign", "campaign_total_opens"]),
  op: z.enum(["equals", "contains", "starts_with", "ends_with", "in", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

const groupSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(conditionSchema).min(1),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  domainIds: z.array(z.coerce.number().int().positive()).default([]),
  groups: z.array(groupSchema).min(1),
});

/** Shared parse: formData (JSON in hidden fields) → validated rules + domain list. */
function parseSegmentForm(formData: FormData) {
  let domainIds: number[] = [];
  let groups: unknown = [];
  try {
    domainIds = JSON.parse(String(formData.get("domainIds") ?? "[]"));
  } catch {
    domainIds = [];
  }
  try {
    groups = JSON.parse(String(formData.get("groups") ?? "[]"));
  } catch {
    groups = [];
  }
  return createSchema.safeParse({ name: formData.get("name"), domainIds, groups });
}

export async function createSegmentAction(_prev: SegmentFormState | undefined, formData: FormData): Promise<SegmentFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = parseSegmentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid segment" };
  const data = parsed.data;

  const rules = normalizeRules({ groups: data.groups });
  if (!rules) return { error: "Invalid conditions" };

  const { lastInsertRowid } = db
    .insert(segments)
    .values({
      workspace_id: workspaceId,
      domain_ids_json: data.domainIds.length > 0 ? JSON.stringify(data.domainIds) : null,
      name: data.name,
      conditions_json: JSON.stringify({ groups: data.groups }),
    })
    .run();

  refreshSegmentEstimate(db, Number(lastInsertRowid), workspaceId);
  logAudit(db, { workspaceId, action: "segment.create", entityType: "segment", entityId: Number(lastInsertRowid), meta: { name: data.name } });
  revalidatePath("/dashboard/segments");
  return { ok: true };
}

export async function updateSegmentAction(id: number, formData: FormData): Promise<SegmentFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = parseSegmentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid segment" };
  const data = parsed.data;

  const rules = normalizeRules({ groups: data.groups });
  if (!rules) return { error: "Invalid conditions" };

  db.update(segments)
    .set({
      domain_ids_json: data.domainIds.length > 0 ? JSON.stringify(data.domainIds) : null,
      name: data.name,
      conditions_json: JSON.stringify({ groups: data.groups }),
    })
    .where(and(eq(segments.id, id), eq(segments.workspace_id, workspaceId)))
    .run();

  refreshSegmentEstimate(db, id, workspaceId);
  logAudit(db, { workspaceId, action: "segment.update", entityType: "segment", entityId: id, meta: { name: data.name } });
  revalidatePath("/dashboard/segments");
  return { ok: true };
}

export async function deleteSegmentAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { ok: false, error: "Not signed in" };

  db.delete(segments)
    .where(and(eq(segments.id, id), eq(segments.workspace_id, Number(session.user.workspaceId))))
    .run();
  logAudit(db, { workspaceId: Number(session.user.workspaceId), action: "segment.delete", entityType: "segment", entityId: id });
  revalidatePath("/dashboard/segments");
  return { ok: true };
}

export interface SegmentEstimateResult {
  count: number;
  error?: string;
}

/** Live estimate for a rules draft (called from the builder). */
export async function estimateSegmentDraft(formData: FormData): Promise<SegmentEstimateResult> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { count: 0, error: "Not signed in" };

  let domainIds: number[] = [];
  let groups: unknown = [];
  try {
    domainIds = JSON.parse(String(formData.get("domainIds") ?? "[]"));
  } catch {
    domainIds = [];
  }
  try {
    groups = JSON.parse(String(formData.get("groups") ?? "[]"));
  } catch {
    groups = [];
  }
  const rules = normalizeRules(groups);
  if (!rules) return { count: 0, error: "Invalid conditions" };

  const count = estimateSegmentRules(db, rules, domainIds.length > 0 ? domainIds : undefined);
  return { count };
}

export type Segment = {
  id: number;
  name: string;
  domain_ids_json: string | null;
  conditions_json: string;
  estimate_count: number | null;
  estimate_at: string | null;
  last_used_at: string | null;
};

export async function listSegments(): Promise<Segment[]> {
  const session = await auth();
  if (!session?.user?.workspaceId) return [];
  return db
    .select({
      id: segments.id,
      name: segments.name,
      domain_ids_json: segments.domain_ids_json,
      conditions_json: segments.conditions_json,
      estimate_count: segments.estimate_count,
      estimate_at: segments.estimate_at,
      last_used_at: segments.last_used_at,
    })
    .from(segments)
    .where(eq(segments.workspace_id, Number(session.user.workspaceId)))
    .orderBy(segments.created_at)
    .all();
}

export type { SegmentRules };
