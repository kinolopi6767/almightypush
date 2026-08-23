"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { domains, segments } from "@pushpanel/db/schema";
import { estimateSegmentRules, refreshSegmentEstimate } from "@pushpanel/db";
import { logAudit } from "@/lib/audit";
import { normalizeRules } from "@pushpanel/core";

export type SegmentFormState = { ok?: boolean; error?: string };

const conditionSchema = z.object({
  field: z.enum(["url", "country", "state", "device", "os", "browser", "subscribed_after", "subscribed_before", "last_active_after", "opened_campaign", "campaign_total_opens"]),
  op: z.enum(["equals", "contains", "starts_with", "ends_with", "in", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
});

const groupSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  // Caps keep total bind parameters far below better-sqlite3's ~32k variable
  // limit (200 values per IN × conditions × groups) — an uncapped rule set
  // would throw mid-transaction AFTER the segment row was inserted.
  conditions: z.array(conditionSchema).min(1).max(25),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  domainIds: z.array(z.coerce.number().int().positive()).max(50).default([]),
  groups: z.array(groupSchema).min(1).max(20),
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

/**
 * A segment's domain list may only reference the workspace's own domains —
 * foreign ids would leak other workspaces' subscriber counts into the
 * estimate and (before the service-level scope) into resolutions.
 */
function ownedDomainIds(workspaceId: number, domainIds: number[]): { ok: true; ids: number[] } | { ok: false; error: string } {
  // Coerce + filter: raw JSON.parse output can contain strings/objects that
  // would crash drizzle's inArray binding.
  const clean = domainIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 50);
  if (clean.length === 0) return { ok: true, ids: [] };
  const owned = new Set(
    db.select({ id: domains.id }).from(domains).where(and(eq(domains.workspace_id, workspaceId), inArray(domains.id, clean))).all().map((d) => d.id),
  );
  const foreign = clean.filter((id) => !owned.has(id));
  if (foreign.length > 0) return { ok: false, error: `Domain not found: ${foreign.join(", ")}` };
  return { ok: true, ids: clean };
}

export async function createSegmentAction(_prev: SegmentFormState | undefined, formData: FormData): Promise<SegmentFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = parseSegmentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid segment" };
  const data = parsed.data;

  const owned = ownedDomainIds(workspaceId, data.domainIds);
  if (!owned.ok) return { error: owned.error };

  const rules = normalizeRules({ groups: data.groups });
  if (!rules) return { error: "Invalid conditions" };

  const { lastInsertRowid } = db
    .insert(segments)
    .values({
      workspace_id: workspaceId,
      domain_ids_json: owned.ids.length > 0 ? JSON.stringify(owned.ids) : null,
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

  const owned = ownedDomainIds(workspaceId, data.domainIds);
  if (!owned.ok) return { error: owned.error };

  const rules = normalizeRules({ groups: data.groups });
  if (!rules) return { error: "Invalid conditions" };

  db.update(segments)
    .set({
      domain_ids_json: owned.ids.length > 0 ? JSON.stringify(owned.ids) : null,
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

export async function deleteSegmentAction(id: number): Promise<void> {
  const session = await auth();
  if (!session?.user?.workspaceId) return;

  db.delete(segments)
    .where(and(eq(segments.id, id), eq(segments.workspace_id, Number(session.user.workspaceId))))
    .run();
  logAudit(db, { workspaceId: Number(session.user.workspaceId), action: "segment.delete", entityType: "segment", entityId: id });
  revalidatePath("/dashboard/segments");
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

  const owned = ownedDomainIds(Number(session.user.workspaceId), domainIds);
  if (!owned.ok) return { count: 0, error: owned.error };

  let count: number;
  try {
    // A pathological rule set can still exceed SQLite's bind-parameter limit —
    // fail gracefully instead of throwing a 500 out of the action.
    count = estimateSegmentRules(db, Number(session.user.workspaceId), rules, owned.ids.length > 0 ? owned.ids : undefined);
  } catch {
    return { count: 0, error: "Segment too complex — reduce conditions" };
  }
  return { count };
}
