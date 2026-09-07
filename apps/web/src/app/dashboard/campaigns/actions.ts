"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns, deliveries, domains, segments, settings } from "@pushpanel/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { InvalidTimezoneError, naiveLocalToUtcMs } from "@pushpanel/core";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export type CampaignFormState = { error?: string; ok?: boolean; id?: number } | undefined;

/**
 * Panel-side creation throttle (mirrors SEND_CREATE_RPM on the REST route):
 * each created campaign can fan out to 1M deliveries, so a compromised
 * session or runaway client must not mint campaigns at line rate and bloat
 * the queue. Internal automation enqueue paths don't go through here.
 */
function creationThrottled(workspaceId: number): boolean {
  return !rateLimit(`campaign:create:${workspaceId}`, 120, 60_000);
}

const createCampaignSchema = z.object({
  domainId: z.coerce.number().int().positive("Choose a domain"),
  title: z.string().trim().min(1, "Title is required").max(120),
  titleB: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().max(500).optional().or(z.literal("")),
  url: z.string().trim().pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
  iconUrl: z.string().trim().pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
  imageUrl: z.string().trim().pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
  buttons: z
    .array(z.object({ label: z.string().trim().min(1, "Button label is required").max(24), url: z.string().trim().refine((u) => /^https?:\/\//i.test(u), "Button URL must be http(s)") }))
    .max(3, "At most 3 action buttons")
    .default([]),
  schedule: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Invalid schedule time").optional().or(z.literal("")),
  audienceKind: z.enum(["all", "segment"]).default("all"),
  segmentId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()),
  templateId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()),
  topic: z.string().trim().max(64).optional().or(z.literal("")),
  ttl: z.coerce.number().int().min(0).max(2419200).optional(),
  urgency: z.enum(["very-low", "low", "normal", "high"]).optional(),
  channel: z.enum(["push", "email"]).optional(),
  variantsJson: z.string().trim().optional().or(z.literal("")),
});

function requireCampaignRole(role: string | undefined): string | null {
  // Fail closed: a role-less session is treated as viewer (read-only).
  const r = (role ?? "viewer").toLowerCase();
  if (["viewer"].includes(r)) return "Viewers cannot create or manage campaigns";
  return null;
}

export async function createCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<NonNullable<CampaignFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  const roleErr = requireCampaignRole(session.user.role);
  if (roleErr) return { error: roleErr };
  if (creationThrottled(workspaceId)) return { error: "Too many campaigns — slow down" };

  const labels = formData.getAll("buttonLabel");
  const urls = formData.getAll("buttonUrl");
  const buttons = labels.map((label, i) => ({ label: String(label), url: String(urls[i] ?? "") })).filter((b) => b.label || b.url);

  const parsed = createCampaignSchema.safeParse({
    domainId: formData.get("domainId"),
    title: formData.get("title"),
    titleB: formData.get("titleB"),
    message: formData.get("message"),
    url: formData.get("url"),
    iconUrl: formData.get("iconUrl"),
    imageUrl: formData.get("imageUrl"),
    buttons,
    schedule: formData.get("schedule"),
    audienceKind: formData.get("audienceKind") ?? "all",
    segmentId: formData.get("segmentId") ?? undefined,
    templateId: formData.get("templateId") ?? undefined,
    topic: formData.get("topic") ?? "",
    ttl: formData.get("ttl") ?? undefined,
    urgency: formData.get("urgency") ?? undefined,
    channel: formData.get("channel") ?? "push",
    variantsJson: formData.get("variantsJson") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const [domain] = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, parsed.data.domainId), eq(domains.workspace_id, workspaceId), eq(domains.status, "active")))
    .limit(1)
    .all();
  if (!domain) return { error: "Domain not found" };

  if (parsed.data.audienceKind === "segment" && !parsed.data.segmentId) {
    return { error: "Pick a segment for the audience" };
  }
  if (parsed.data.segmentId) {
    const [segment] = db
      .select({ id: segments.id })
      .from(segments)
      .where(and(eq(segments.id, parsed.data.segmentId), eq(segments.workspace_id, workspaceId)))
      .limit(1)
      .all();
    if (!segment) return { error: "Segment not found" };
  }

  const audience = parsed.data.audienceKind === "segment"
    ? { kind: "segment", segment_id: parsed.data.segmentId }
    : { kind: "all" };

  // LumaPush: A/B up to 10 variants via variantsJson [{key,title,message,image,weight}]
  let variantsJson: string | null = null;
  if (parsed.data.variantsJson) {
    try {
      const arr = JSON.parse(parsed.data.variantsJson) as unknown[];
      if (!Array.isArray(arr) || arr.length < 2 || arr.length > 10) return { error: "Variants must be 2-10 items" };
      const cleaned = arr.map((v, i) => {
        const o = v as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title.trim() : "";
        if (!title || title.length > 120) throw new Error(`Variant ${i} title required max 120`);
        const img = typeof o.image_url === "string" ? o.image_url.trim() : undefined;
        if (img && !/^https?:\/\//i.test(img)) throw new Error(`Variant ${i} image_url must be http(s)`);
        return {
          key: typeof o.key === "string" && o.key ? o.key.trim().slice(0, 12) : String.fromCharCode(65 + i),
          title,
          message: typeof o.message === "string" ? o.message.trim().slice(0, 500) : undefined,
          image_url: img,
          weight: Math.max(1, Math.min(100, Number(o.weight) || 10)),
        };
      });
      variantsJson = JSON.stringify(cleaned);
    } catch {
      // V8 SyntaxError messages leak input fragments + offsets — return a
      // generic message instead.
      return { error: "Invalid variants JSON" };
    }
  }

  // The datetime-local value is a naive wall clock reading: interpret it in
  // the panel's configured timezone (falls back to the server's local time).
  let scheduleAt: string;
  if (parsed.data.schedule) {
    const [tzRow] = db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "timezone"))
      .limit(1)
      .all();
    let t: number;
    try {
      t = naiveLocalToUtcMs(parsed.data.schedule, tzRow?.value || undefined);
    } catch (error) {
      // a legacy/bad stored timezone must not brick scheduling — fall back
      // to the server's local interpretation and surface a warning.
      // Any other parse failure is user input error, never a 500.
      if (error instanceof InvalidTimezoneError) {
        try {
          t = naiveLocalToUtcMs(parsed.data.schedule, undefined);
        } catch {
          return { error: "Invalid schedule time" };
        }
      } else {
        return { error: "Invalid schedule time" };
      }
    }
    if (Number.isNaN(t)) return { error: "Invalid schedule time" };
    scheduleAt = new Date(t).toISOString();
  } else {
    scheduleAt = new Date().toISOString();
  }

  const campaign = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: domain.id,
      channel: parsed.data.channel ?? "push",
      title: parsed.data.title,
      title_b: parsed.data.titleB || null,
      variants_json: variantsJson,
      message: parsed.data.message || null,
      launch_url: parsed.data.url || null,
      icon_url: parsed.data.iconUrl || null,
      image_url: parsed.data.imageUrl || null,
      buttons_json: parsed.data.buttons.length ? JSON.stringify(parsed.data.buttons) : null,
      audience_json: JSON.stringify(audience),
      template_id: parsed.data.templateId ?? null,
      topic: parsed.data.topic || null,
      ttl: parsed.data.ttl ?? 86400,
      urgency: parsed.data.urgency ?? "normal",
      schedule_at: scheduleAt,
      scheduled: 1,
      status: "scheduled",
      source: "panel",
    })
    .run();
  if (!campaign.lastInsertRowid) return { error: "Failed to create campaign" };
  logAudit(db, { workspaceId, action: "campaign.create", entityType: "campaign", entityId: Number(campaign.lastInsertRowid), meta: { title: parsed.data.title } });

  return { ok: true, id: Number(campaign.lastInsertRowid) };
}

export async function cancelCampaignAction(campaignId: number): Promise<CampaignFormState> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { error: "Invalid campaign" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  const roleErr2 = requireCampaignRole(session.user.role);
  if (roleErr2) return { error: roleErr2 };

  const [campaign] = db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!campaign) return { error: "Campaign not found" };
  if (!["draft", "scheduled", "sending"].includes(campaign.status)) {
    return { error: `Cannot cancel a campaign in state ${campaign.status}` };
  }

  db.transaction((tx) => {
    tx.update(campaigns)
      .set({ status: "cancelled" })
      // TOCTOU guard: the worker may have finished the send between the check
      // above and this write — never flip a done/failed/cancelled campaign.
      .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["draft", "scheduled", "sending"])))
      .run();
    tx.update(deliveries)
      // sent_at stamped so retention pruning (which requires it) can clean
      // these cancelled rows up — otherwise they'd accumulate forever.
      .set({ status: "cancelled", error: "cancelled by operator", sent_at: Date.now() })
      .where(and(eq(deliveries.campaign_id, campaignId), inArray(deliveries.status, ["queued", "sending"])))
      .run();
  });

  logAudit(db, { workspaceId, action: "campaign.cancel", entityType: "campaign", entityId: campaignId });
  return { ok: true };
}

/**
 * Retry failed deliveries: requeue a finished campaign's terminally-failed
 * rows (provider 5xx, timeouts, rate-limit exhaustion) so the sender picks
 * them up on the next cycle. Policy-suppressed rows (fatigue caps) are
 * included — the operator explicitly asked for another attempt.
 *
 * Attempts reset to 0 so MAX_ATTEMPTS backoff starts fresh; in-flight rows
 * (queued/sending) are untouched, and the campaign flips back to `sending`
 * only from a terminal state (TOCTOU-guarded, like cancel).
 */
export async function retryFailedDeliveriesAction(campaignId: number): Promise<CampaignFormState> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { error: "Invalid campaign" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  const roleErr = requireCampaignRole(session.user.role);
  if (roleErr) return { error: roleErr };

  const [campaign] = db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!campaign) return { error: "Campaign not found" };
  if (!["done", "failed"].includes(campaign.status)) {
    return { error: `Retry is available once the campaign finishes (state: ${campaign.status})` };
  }

  const requeued = db.transaction((tx) => {
    const changed = tx
      .update(deliveries)
      .set({ status: "queued", attempts: 0, next_attempt_at: null, claimed_at: null, error: null })
      .where(and(eq(deliveries.campaign_id, campaignId), eq(deliveries.status, "failed")))
      .run();
    if ((changed.changes ?? 0) > 0) {
      tx.update(campaigns)
        .set({ status: "sending" })
        .where(and(eq(campaigns.id, campaignId), inArray(campaigns.status, ["done", "failed"])))
        .run();
    }
    return changed.changes ?? 0;
  });

  if (requeued === 0) return { error: "No failed deliveries to retry" };
  logAudit(db, {
    workspaceId,
    action: "campaign.retry",
    entityType: "campaign",
    entityId: campaignId,
    meta: { retried: requeued },
  });
  return { ok: true, id: campaignId };
}

/**
 * Quick push (B8): duplicate a campaign's payload + audience and fire it
 * immediately, reusing the same domain, icon, image and action buttons.
 */
export async function duplicateCampaignAction(campaignId: number): Promise<CampaignFormState> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { error: "Invalid campaign" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  const roleErr3 = requireCampaignRole(session.user.role);
  if (roleErr3) return { error: roleErr3 };
  if (creationThrottled(workspaceId)) return { error: "Too many campaigns — slow down" };

  const [source] = db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      title_b: campaigns.title_b,
      variants_json: campaigns.variants_json,
      message: campaigns.message,
      icon_url: campaigns.icon_url,
      image_url: campaigns.image_url,
      launch_url: campaigns.launch_url,
      buttons_json: campaigns.buttons_json,
      audience_json: campaigns.audience_json,
      domain_id: campaigns.domain_id,
      channel: campaigns.channel,
      topic: campaigns.topic,
      ttl: campaigns.ttl,
      urgency: campaigns.urgency,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!source) return { error: "Campaign not found" };

  const insert = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: source.domain_id,
      channel: source.channel,
      title: source.title,
      title_b: source.title_b,
      variants_json: source.variants_json,
      message: source.message,
      icon_url: source.icon_url,
      image_url: source.image_url,
      launch_url: source.launch_url,
      buttons_json: source.buttons_json,
      audience_json: source.audience_json,
      topic: source.topic,
      ttl: source.ttl,
      urgency: source.urgency,
      schedule_at: new Date().toISOString(),
      scheduled: 1,
      status: "scheduled",
      source: "panel",
    })
    .run();
  if (!insert.lastInsertRowid) return { error: "Failed to duplicate campaign" };
  logAudit(db, { workspaceId, action: "campaign.duplicate", entityType: "campaign", entityId: Number(insert.lastInsertRowid), meta: { from: campaignId } });
  return { ok: true, id: Number(insert.lastInsertRowid) };
}

/**
 * Resend this campaign to everyone who received it but never clicked
 * (audience kind `non_clickers`, resolved by the worker at send time).
 */
export async function resendToNonClickersAction(campaignId: number): Promise<CampaignFormState> {
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { error: "Invalid campaign" };
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };
  const roleErr4 = requireCampaignRole(session.user.role);
  if (roleErr4) return { error: roleErr4 };
  if (creationThrottled(workspaceId)) return { error: "Too many campaigns — slow down" };

  const [source] = db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      title_b: campaigns.title_b,
      variants_json: campaigns.variants_json,
      message: campaigns.message,
      icon_url: campaigns.icon_url,
      image_url: campaigns.image_url,
      launch_url: campaigns.launch_url,
      buttons_json: campaigns.buttons_json,
      domain_id: campaigns.domain_id,
      channel: campaigns.channel,
      topic: campaigns.topic,
      ttl: campaigns.ttl,
      urgency: campaigns.urgency,
      status: campaigns.status,
      sent_at: campaigns.sent_at,
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!source) return { error: "Campaign not found" };
  // Retargeting only makes sense for a finished send with deliveries.
  if (source.status !== "done" || !source.sent_at) {
    return { error: "Only completed campaigns can be resent to non-clickers" };
  }

  const insert = db
    .insert(campaigns)
    .values({
      workspace_id: workspaceId,
      domain_id: source.domain_id,
      channel: source.channel,
      title: `Re: ${source.title}`.slice(0, 120),
      variants_json: source.variants_json,
      message: source.message,
      icon_url: source.icon_url,
      image_url: source.image_url,
      launch_url: source.launch_url,
      buttons_json: source.buttons_json,
      audience_json: JSON.stringify({ kind: "non_clickers", source_campaign_id: source.id }),
      topic: source.topic ? `${source.topic}-r2`.slice(0, 64) : null,
      ttl: source.ttl,
      urgency: source.urgency,
      schedule_at: new Date().toISOString(),
      scheduled: 1,
      status: "scheduled",
      source: "panel",
    })
    .run();
  if (!insert.lastInsertRowid) return { error: "Failed to create resend" };
  logAudit(db, { workspaceId, action: "campaign.duplicate", entityType: "campaign", entityId: Number(insert.lastInsertRowid), meta: { from: campaignId, retarget: "non_clickers" } });
  return { ok: true, id: Number(insert.lastInsertRowid) };
}
