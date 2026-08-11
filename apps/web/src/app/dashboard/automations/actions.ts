"use server";

import { logAudit } from "@/lib/audit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { domains } from "@pushpanel/db/schema";
import { automations } from "@pushpanel/db/schema";
import { AUTOMATION_TYPES, automationPayloadSchema, newWebhookSecret } from "@pushpanel/core";

export type AutomationFormState = { ok?: boolean; error?: string };

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(AUTOMATION_TYPES),
  domainId: z.coerce.number().int().positive(),
  payload: automationPayloadSchema,
  delay_seconds: z.coerce.number().int().min(0).max(86_400).default(0),
  interval_minutes: z.coerce.number().int().min(1).max(10_080).default(15),
  source_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  range: z.coerce.number().int().min(1).max(100).default(10),
  rotation_json: z.string().trim().optional().or(z.literal("")),
  feed_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export async function createAutomationAction(_prev: AutomationFormState | undefined, formData: FormData): Promise<AutomationFormState> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    domainId: formData.get("domainId"),
    payload: {
      title: formData.get("title"),
      message: formData.get("message") ?? "",
      icon_url: formData.get("icon_url") ?? "",
      launch_url: formData.get("launch_url") ?? "",
    },
    delay_seconds: formData.get("delay_seconds") ?? 0,
    interval_minutes: formData.get("interval_minutes") ?? 15,
    source_url: formData.get("source_url") ?? "",
    range: formData.get("range") ?? 10,
    rotation_json: formData.get("rotation_json") ?? "",
    feed_url: formData.get("feed_url") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const [domain] = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, data.domainId), eq(domains.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!domain) return { error: "Domain not found" };

  const config: Record<string, unknown> = {
    payload: data.payload,
    delay_seconds: data.delay_seconds,
    interval_minutes: data.interval_minutes,
  };
  if (data.type === "automagic_dynamic") {
    config.source_url = data.source_url;
    config.range = data.range;
  }
  if (data.type === "automagic_static") {
    const list = data.rotation_json ? safeParseRotation(data.rotation_json) : [];
    if (data.rotation_json && list.length === 0) return { error: "Rotation list must be a JSON array of { title, ... } items" };
    config.rotation_json = JSON.stringify(list);
  }
  if (data.type === "youtube_push" || data.type === "rss_push") config.feed_url = data.feed_url;
  if (data.type === "push_on_publish") config.secret = newWebhookSecret();

  const isPollType = data.type === "automagic_dynamic" || data.type === "automagic_static" || data.type === "youtube_push" || data.type === "rss_push";
  db.insert(automations)
    .values({
      workspace_id: workspaceId,
      domain_id: data.domainId,
      type: data.type,
      name: data.name,
      config_json: JSON.stringify(config),
      audience_json: JSON.stringify({ kind: "all" }),
      status: "active",
      next_run_at: isPollType ? new Date().toISOString() : null,
    })
    .run();

  logAudit(db, { workspaceId, action: "automation.create", entityType: "automation", meta: { name: data.name } });
  revalidatePath("/dashboard/automations");
  return { ok: true };
}

interface RotationItem {
  title: string;
  message?: string;
  launch_url?: string;
}

function safeParseRotation(json: string): RotationItem[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is RotationItem => !!i && typeof i === "object" && typeof (i as RotationItem).title === "string",
    );
  } catch {
    return [];
  }
}

export async function toggleAutomationAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { ok: false, error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const [row] = db
    .select({ id: automations.id, status: automations.status })
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) return { ok: false, error: "Not found" };

  db.update(automations)
    .set({ status: row.status === "active" ? "paused" : "active", next_run_at: row.status === "active" ? null : new Date().toISOString() })
    .where(eq(automations.id, row.id))
    .run();
  logAudit(db, { workspaceId, action: "automation.toggle", entityType: "automation", entityId: id, meta: { status: row.status === "active" ? "paused" : "active" } });
  revalidatePath("/dashboard/automations");
  return { ok: true };
}

export async function runAutomationNowAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { ok: false, error: "Not signed in" };
  const workspaceId = Number(session.user.workspaceId);

  const [row] = db
    .select({ id: automations.id, status: automations.status })
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) return { ok: false, error: "Not found" };
  if (row.status !== "active") return { ok: false, error: "Automation is paused" };

  db.update(automations).set({ next_run_at: new Date().toISOString() }).where(eq(automations.id, row.id)).run();
  logAudit(db, { workspaceId, action: "automation.run", entityType: "automation", entityId: id });
  revalidatePath("/dashboard/automations");
  return { ok: true };
}

export async function deleteAutomationAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.workspaceId) return { ok: false, error: "Not signed in" };

  db.delete(automations)
    .where(and(eq(automations.id, id), eq(automations.workspace_id, Number(session.user.workspaceId))))
    .run();
  logAudit(db, { workspaceId: Number(session.user.workspaceId), action: "automation.delete", entityType: "automation", entityId: id });
  revalidatePath("/dashboard/automations");
  return { ok: true };
}