"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createVapidConfig } from "@pushpanel/core";
import { campaigns, deliveries, domains, subscribers } from "@pushpanel/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

export type DomainFormState = { error?: string; ok?: boolean; id?: number; count?: number } | undefined;

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

const createDomainSchema = z.object({
  name: z.string().trim().toLowerCase().regex(HOSTNAME_RE, "Enter a valid hostname, e.g. app.example.com"),
  url: z.string().trim().url().optional().or(z.literal("")),
});

export async function createDomainAction(
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace — run setup first" };

  const parsed = createDomainSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const existing = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.workspace_id, workspaceId), eq(domains.name, parsed.data.name)))
    .limit(1)
    .get();
  if (existing) return { error: "A domain with this hostname already exists" };

  const subject = `mailto:owner@${parsed.data.name}`;
  const vapid = createVapidConfig(process.env.APP_ENC_KEY, subject);
  const inserted = db
    .insert(domains)
    .values({
      workspace_id: workspaceId,
      name: parsed.data.name,
      provider: "vapid",
      provider_config_json: JSON.stringify(vapid),
      app_config_json: JSON.stringify({ url: parsed.data.url || `https://${parsed.data.name}`, prompt: { kind: "auto" } }),
      status: "active",
    })
    .run();
  if (!inserted.lastInsertRowid) return { error: "Failed to create domain" };
  logAudit(db, { workspaceId, action: "domain.create", entityType: "domain", entityId: Number(inserted.lastInsertRowid), meta: { name: parsed.data.name } });

  return { ok: true, id: Number(inserted.lastInsertRowid) };
}

const promptSchema = z.object({
  kind: z.enum(["auto", "backdrop", "fullscreen", "firstVisit", "bell", "none"]),
  position: z.enum(["bottom-left", "bottom-right", "top-left", "top-right"]).optional(),
  delayMs: z.coerce.number().int().min(0).max(60000).optional(),
  scrollDepth: z.coerce.number().min(0).max(1).optional(),
  idleMs: z.coerce.number().int().min(0).max(60000).optional(),
  customCss: z.string().max(5000).optional().or(z.literal("")),
  title: z.string().max(80).optional().or(z.literal("")),
  message: z.string().max(200).optional().or(z.literal("")),
  allowLabel: z.string().max(24).optional().or(z.literal("")),
  dismissLabel: z.string().max(24).optional().or(z.literal("")),
});

const testPushSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  message: z.string().trim().max(500).optional().or(z.literal("")),
  url: z.string().trim().url().optional().or(z.literal("")),
});

export async function sendTestPushAction(
  domainId: number,
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const parsed = testPushSchema.safeParse({
    title: formData.get("title"),
    message: formData.get("message"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const [domain] = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId), eq(domains.status, "active")))
    .limit(1)
    .all();
  if (!domain) return { error: "Domain not found" };

  const audience = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();

  if (audience.length === 0) return { error: "No active subscribers yet — add the SDK to your site first" };

  const campaign = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      title: parsed.data.title,
      message: parsed.data.message || null,
      launch_url: parsed.data.url || null,
      audience_json: JSON.stringify({ kind: "all" }),
      status: "sending",
      source: "panel",
    })
    .run();
  const campaignId = Number(campaign.lastInsertRowid);

  db.transaction((tx) => {
    for (const sub of audience) {
      tx.insert(deliveries)
        .values({ campaign_id: campaignId, subscriber_id: sub.id, domain_id: domainId, status: "queued" })
        .run();
    }
  });

  return { ok: true, id: campaignId, count: audience.length };
}

export async function updateDomainPromptAction(
  domainId: number,
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const parsed = promptSchema.safeParse({
    kind: formData.get("kind"),
    position: formData.get("position") || undefined,
    delayMs: formData.get("delayMs") || undefined,
    scrollDepth: formData.get("scrollDepth") || undefined,
    idleMs: formData.get("idleMs") || undefined,
    customCss: formData.get("customCss") ?? "",
    title: formData.get("title") ?? "",
    message: formData.get("message") ?? "",
    allowLabel: formData.get("allowLabel") ?? "",
    dismissLabel: formData.get("dismissLabel") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid prompt config" };

  const [domain] = db.select({ id: domains.id, app_config_json: domains.app_config_json }).from(domains).where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId))).limit(1).all();
  if (!domain) return { error: "Domain not found" };

  let cfg: Record<string, unknown> = {};
  try {
    cfg = domain.app_config_json ? JSON.parse(domain.app_config_json) : {};
  } catch {
    cfg = {};
  }
  cfg.prompt = {
    kind: parsed.data.kind,
    position: parsed.data.position ?? "bottom-right",
    delayMs: parsed.data.delayMs ?? 1500,
    scrollDepth: parsed.data.scrollDepth,
    idleMs: parsed.data.idleMs,
    customCss: parsed.data.customCss || undefined,
    texts: {
      title: parsed.data.title || undefined,
      message: parsed.data.message || undefined,
      allow: parsed.data.allowLabel || undefined,
      dismiss: parsed.data.dismissLabel || undefined,
    },
  };
  // White-label: if customCss contains branding removal, keep as is; UI handles

  db.update(domains).set({ app_config_json: JSON.stringify(cfg) }).where(eq(domains.id, domainId)).run();
  logAudit(db, { workspaceId, action: "domain.create", entityType: "domain", entityId: domainId, meta: { prompt: parsed.data.kind } });
  return { ok: true, id: domainId };
}
