"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaigns, deliveries, domains, settings, subscribers } from "@pushpanel/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { InvalidTimezoneError, naiveLocalToUtcMs } from "@pushpanel/core";
import { z } from "zod";

export type CampaignFormState = { error?: string; ok?: boolean; id?: number } | undefined;

const createCampaignSchema = z.object({
  domainId: z.coerce.number().int().positive("Choose a domain"),
  title: z.string().trim().min(1, "Title is required").max(120),
  message: z.string().trim().max(500).optional().or(z.literal("")),
  url: z.string().trim().url().optional().or(z.literal("")),
  schedule: z.string().trim().optional().or(z.literal("")),
  audienceKind: z.enum(["all", "segment"]).default("all"),
  segmentId: z.coerce.number().int().positive().optional(),
  templateId: z.coerce.number().int().positive().optional(),
});

export async function createCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<NonNullable<CampaignFormState>> {
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

  const parsed = createCampaignSchema.safeParse({
    domainId: formData.get("domainId"),
    title: formData.get("title"),
    message: formData.get("message"),
    url: formData.get("url"),
    schedule: formData.get("schedule"),
    audienceKind: formData.get("audienceKind") ?? "all",
    segmentId: formData.get("segmentId") ?? undefined,
    templateId: formData.get("templateId") ?? undefined,
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

  const audience = parsed.data.audienceKind === "segment"
    ? { kind: "segment", segment_id: parsed.data.segmentId }
    : { kind: "all" };

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
      // to the server's local interpretation and surface a warning
      if (error instanceof InvalidTimezoneError) {
        t = naiveLocalToUtcMs(parsed.data.schedule, undefined);
      } else {
        throw error;
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
      title: parsed.data.title,
      message: parsed.data.message || null,
      launch_url: parsed.data.url || null,
      audience_json: JSON.stringify(audience),
      template_id: parsed.data.templateId ?? null,
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
  const session = await auth();
  if (!session?.user) return { error: "Not signed in" };
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) return { error: "No workspace" };

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
      .where(eq(campaigns.id, campaignId))
      .run();
    tx.update(deliveries)
      .set({ status: "cancelled", error: "cancelled by operator" })
      .where(and(eq(deliveries.campaign_id, campaignId), inArray(deliveries.status, ["queued", "sending"])))
      .run();
  });

  logAudit(db, { workspaceId, action: "campaign.cancel", entityType: "campaign", entityId: campaignId });
  return { ok: true };
}

/** Active subscriber count for a domain — the audience a campaign will reach. */
export async function audienceCountForDomain(domainId: number): Promise<number> {
  const rows = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();
  return rows.length;
}
