"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireEditorRole } from "@/lib/roles";
import { createVapidConfig } from "@pushpanel/core";
import {
  apiKeys,
  automations,
  campaigns,
  deliveries,
  domains,
  lpLinks,
  subscriberTags,
  subscribers,
  youtubeChannels,
} from "@pushpanel/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

export type DomainFormState = { error?: string; ok?: boolean; id?: number; count?: number } | undefined;

const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/**
 * Users paste full URLs ("https://site.online/path") into the hostname field.
 * Strip scheme, credentials, port, path — keep only the hostname.
 */
function sanitizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "") // https://, http://, etc.
    .replace(/^[^/@]*@/, "") // user@host
    .split(/[/?#]/)[0] ?? "" // path/query/hash
    .replace(/:\d{1,5}$/, ""); // :port
}

const createDomainSchema = z.object({
  name: z.string().trim().toLowerCase().regex(HOSTNAME_RE, "Enter a valid hostname, e.g. app.example.com"),
  url: z.string().trim().pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
});

export async function createDomainAction(
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace — run setup first" };

  const parsed = createDomainSchema.safeParse({
    name: sanitizeHostname(String(formData.get("name") ?? "")),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    const raw = String(formData.get("name") ?? "");
    const hint = /[/:@\s]/.test(raw.trim())
      ? " — paste only the hostname, without https:// or paths"
      : "";
    return { error: (parsed.error.issues[0]?.message ?? "Invalid input") + hint };
  }

  const existing = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.workspace_id, workspaceId), eq(domains.name, parsed.data.name)))
    .limit(1)
    .get();
  if (existing) return { error: "A domain with this hostname already exists" };

  const subject = `mailto:owner@${parsed.data.name}`;
  let vapid;
  try {
    // keyFrom() throws without a valid APP_ENC_KEY — surface a friendly
    // error instead of a framework 500.
    vapid = createVapidConfig(process.env.APP_ENC_KEY, subject);
  } catch {
    return { error: "Server encryption key missing or invalid — set APP_ENC_KEY (64 hex chars) and redeploy" };
  }
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
  revalidatePath("/dashboard/domains");

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
  url: z.string().trim().pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
});

export async function sendTestPushAction(
  domainId: number,
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  // Test pushes create real campaigns; throttle per workspace so a stuck
  // button (or scripted editor) cannot mint them at line rate.
  if (!rateLimit(`test-push:${workspaceId}`, 10, 60_000)) {
    return { error: "Too many test pushes — wait a minute and try again" };
  }

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

  // Safety cap: this form is labeled "test" but historically queued a
  // delivery for EVERY active subscriber — one misclick on a large list was
  // a full campaign. Cap to the 25 most recent subscriptions; real sends
  // belong to the Campaigns composer.
  const audience = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .orderBy(sql`id DESC`)
    .limit(25)
    .all();

  if (audience.length === 0) return { error: "No active subscribers yet — add the SDK to your site first" };

  // FIX: audience must be manual with explicit ids, otherwise the scheduler/worker
  // would re-resolve {kind:"all"} to EVERY active subscriber and bypass the 25 cap.
  const manualIds = audience.map((s) => s.id);
  const campaign = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: domainId,
      title: parsed.data.title,
      message: parsed.data.message || null,
      launch_url: parsed.data.url || null,
      audience_json: JSON.stringify({ kind: "manual", ids: manualIds }),
      status: "sending",
      source: "panel",
      // Deliveries are inserted immediately below — the fan-out is complete,
      // so the sender may finalize this campaign once they drain.
      audience_complete: 1,
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
  logAudit(db, {
    workspaceId,
    action: "domain.test_push",
    entityType: "campaign",
    entityId: campaignId,
    meta: { domain_id: domainId, count: audience.length },
  });
  revalidatePath(`/dashboard/domains/${domainId}`);
  revalidatePath("/dashboard/campaigns");

  return { ok: true, id: campaignId, count: audience.length };
}

function sanitizeCustomCss(css: string): string | undefined {
  if (!css.trim()) return undefined;
  // Block dangerous constructs while preserving legitimate styling.
  const lower = css.toLowerCase();
  const blocked = ["expression(", "javascript:", "behavior:", "binding:", "-moz-binding", "vbscript:"];
  for (const b of blocked) if (lower.includes(b)) return undefined;
  // Strip @import with external URLs (could load untrusted styles) — keep only safe @imports
  // For premium hardening, disallow @import entirely (admin can paste full rules inline)
  if (/@import/i.test(css)) return css.replace(/@import[^;]+;/gi, "/* @import blocked */");
  return css.slice(0, 5000);
}

export async function updateDomainPromptAction(
  domainId: number,
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
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
    customCss: sanitizeCustomCss(parsed.data.customCss ?? "") || undefined,
    texts: {
      title: parsed.data.title || undefined,
      message: parsed.data.message || undefined,
      allow: parsed.data.allowLabel || undefined,
      dismiss: parsed.data.dismissLabel || undefined,
    },
  };
  // White-label: if customCss contains branding removal, keep as is; UI handles

  db.update(domains).set({ app_config_json: JSON.stringify(cfg) }).where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId))).run();
  logAudit(db, { workspaceId, action: "domain.update", entityType: "domain", entityId: domainId, meta: { prompt: parsed.data.kind } });
  revalidatePath(`/dashboard/domains/${domainId}`);
  revalidatePath("/dashboard/domains");
  return { ok: true, id: domainId };
}

/**
 * Pause / resume a domain. Paused domains stop everything: the scheduler
 * won't start their campaigns, the sender won't claim their deliveries
 * (queued rows wait and flow again on resume — nothing is lost), and the
 * public subscribe/resubscribe/tags/test-push paths already require
 * status='active'. Unsubscribe keeps working (opt-out must never be gated).
 */
export async function setDomainStatusAction(domainId: number, status: "active" | "paused"): Promise<DomainFormState> {
  if (!Number.isInteger(domainId) || domainId <= 0) return { error: "Invalid domain" };
  if (status !== "active" && status !== "paused") return { error: "Invalid status" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const changed = db
    .update(domains)
    .set({ status })
    .where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId)))
    .run();
  if (changed.changes === 0) return { error: "Domain not found" };
  logAudit(db, { workspaceId, action: "domain.update", entityType: "domain", entityId: domainId, meta: { status } });
  revalidatePath(`/dashboard/domains/${domainId}`);
  revalidatePath("/dashboard/domains");
  return { ok: true, id: domainId };
}

/**
 * Permanently delete a domain and everything scoped to it: campaigns (+
 * deliveries, deleted explicitly in chunks), subscribers (+ tags, which have
 * no FK), automations, domain-scoped API keys. LP links / YouTube channels
 * keep working with domain_id nulled (shareable URLs, not domain data).
 * Events/analytics history is kept (no FK, workspace analytics stay intact).
 */
export async function deleteDomainAction(domainId: number): Promise<DomainFormState> {
  if (!Number.isInteger(domainId) || domainId <= 0) return { error: "Invalid domain" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const [domain] = db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!domain) return { error: "Domain not found" };

  db.transaction((tx) => {
    // Campaigns first, chunked so a 1M-delivery domain doesn't hold one
    // giant write lock (deliveries deleted explicitly per chunk).
    const campIds = tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.domain_id, domainId), eq(campaigns.workspace_id, workspaceId)))
      .all()
      .map((r) => r.id);
    for (let i = 0; i < campIds.length; i += 500) {
      const slice = campIds.slice(i, i + 500);
      if (slice.length === 0) continue;
      tx.delete(deliveries).where(inArray(deliveries.campaign_id, slice)).run();
      tx.delete(campaigns).where(inArray(campaigns.id, slice)).run();
    }
    // Tags reference subscribers without an FK — purge before subscribers go.
    tx.delete(subscriberTags)
      .where(
        inArray(
          subscriberTags.subscriber_id,
          tx.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.domain_id, domainId)),
        ),
      )
      .run();
    tx.delete(subscribers).where(eq(subscribers.domain_id, domainId)).run();
    tx.delete(automations).where(and(eq(automations.domain_id, domainId), eq(automations.workspace_id, workspaceId))).run();
    tx.delete(apiKeys).where(and(eq(apiKeys.domain_id, domainId), eq(apiKeys.workspace_id, workspaceId))).run();
    tx.update(lpLinks).set({ domain_id: null }).where(and(eq(lpLinks.domain_id, domainId), eq(lpLinks.workspace_id, workspaceId))).run();
    tx.update(youtubeChannels).set({ domain_id: null }).where(and(eq(youtubeChannels.domain_id, domainId), eq(youtubeChannels.workspace_id, workspaceId))).run();
    tx.delete(domains).where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId))).run();
  });

  logAudit(db, { workspaceId, action: "domain.delete", entityType: "domain", entityId: domainId, meta: { name: domain.name } });
  revalidatePath("/dashboard/domains");
  return { ok: true, id: domainId };
}

const cloneDomainSchema = z.object({
  name: z.string().trim().toLowerCase().regex(HOSTNAME_RE, "Enter a valid hostname, e.g. app.example.com"),
});

/**
 * B10: clone a domain's configuration into a new hostname. Copies the prompt
 * settings (kind/position/texts/…) so multi-site rollouts don't re-enter them
 * per site; mints a FRESH VAPID keypair (keys are per-hostname for
 * deliverability and must never be shared). No subscribers, campaigns,
 * automations or keys are carried over.
 */
export async function cloneDomainAction(
  sourceId: number,
  _prev: DomainFormState,
  formData: FormData,
): Promise<NonNullable<DomainFormState>> {
  if (!Number.isInteger(sourceId) || sourceId <= 0) return { error: "Invalid domain" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  if (requireEditorRole(session.user.role)) return { error: "Viewers cannot create or manage content" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const parsed = cloneDomainSchema.safeParse({ name: sanitizeHostname(String(formData.get("name") ?? "")) });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid hostname" };

  const [source] = db
    .select({ id: domains.id, app_config_json: domains.app_config_json })
    .from(domains)
    .where(and(eq(domains.id, sourceId), eq(domains.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!source) return { error: "Source domain not found" };

  const existing = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.workspace_id, workspaceId), eq(domains.name, parsed.data.name)))
    .limit(1)
    .get();
  if (existing) return { error: "A domain with this hostname already exists" };

  let vapid;
  try {
    vapid = createVapidConfig(process.env.APP_ENC_KEY, `mailto:owner@${parsed.data.name}`);
  } catch {
    return { error: "Server encryption key missing or invalid — set APP_ENC_KEY (64 hex chars) and redeploy" };
  }

  // Carry over prompt config only (validated shape unknown — parse defensively,
  // keep the prompt subtree when it parses to an object, else fresh default).
  let appConfig: Record<string, unknown> = { url: `https://${parsed.data.name}`, prompt: { kind: "auto" } };
  try {
    const srcCfg = source.app_config_json ? (JSON.parse(source.app_config_json) as Record<string, unknown>) : null;
    if (srcCfg && typeof srcCfg === "object" && srcCfg.prompt && typeof srcCfg.prompt === "object") {
      appConfig = { url: `https://${parsed.data.name}`, prompt: srcCfg.prompt };
    }
  } catch {
    // keep default
  }

  const inserted = db
    .insert(domains)
    .values({
      workspace_id: workspaceId,
      name: parsed.data.name,
      provider: "vapid",
      provider_config_json: JSON.stringify(vapid),
      app_config_json: JSON.stringify(appConfig),
      status: "active",
    })
    .run();
  if (!inserted.lastInsertRowid) return { error: "Failed to clone domain" };
  const newId = Number(inserted.lastInsertRowid);
  logAudit(db, { workspaceId, action: "domain.clone", entityType: "domain", entityId: newId, meta: { from: sourceId, name: parsed.data.name } });
  revalidatePath("/dashboard/domains");
  return { ok: true, id: newId };
}
