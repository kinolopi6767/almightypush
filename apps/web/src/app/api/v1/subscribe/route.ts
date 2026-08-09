import { NextResponse } from "next/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { createCipher, sha256Hex } from "@pushpanel/core";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { automations } from "@pushpanel/db/schema";
import { enqueueAutomationCampaign } from "@pushpanel/db";
import { parseAutomationConfig } from "@pushpanel/core";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  device: z.string().trim().max(40).optional().or(z.literal("")),
  browser: z.string().trim().max(40).optional().or(z.literal("")),
  os: z.string().trim().max(40).optional().or(z.literal("")),
  subscribeUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Public subscribe endpoint — called by the client SDK.
 * Subscriptions are encrypted at rest; lookups/dedup run on a sha256 hash.
 */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const data = parsed.data;
  const [domain] = db
    .select({ id: domains.id, workspace_id: domains.workspace_id })
    .from(domains)
    .where(and(eq(domains.id, data.domainId), eq(domains.status, "active")))
    .limit(1)
    .all();
  if (!domain) return NextResponse.json({ ok: false, error: "Unknown domain" }, { status: 404 });

  const token = JSON.stringify(data.subscription);
  const tokenHash = sha256Hex(data.subscription.endpoint);
  const enc = createCipher(process.env.APP_ENC_KEY);
  const now = new Date().toISOString();

  const [existing] = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domain.id), eq(subscribers.token_hash, tokenHash), isNull(subscribers.unsubscribed_at)))
    .limit(1)
    .all();

  let subscriberId: number;
  if (existing) {
    subscriberId = existing.id;
    db.update(subscribers)
      .set({ token: enc.encrypt(token), last_active_at: now, device: data.device || null, browser: data.browser || null, os: data.os || null })
      .where(eq(subscribers.id, existing.id))
      .run();
  } else {
    const inserted = db
      .insert(subscribers)
      .values({
        domain_id: domain.id,
        token: enc.encrypt(token),
        token_hash: tokenHash,
        provider: "vapid",
        device: data.device || null,
        browser: data.browser || null,
        os: data.os || null,
        subscribe_url: data.subscribeUrl || null,
        subscribe_at: now,
        last_active_at: now,
      })
      .run();
    subscriberId = Number(inserted.lastInsertRowid);
  }

  db.insert(events).values({ domain_id: domain.id, subscriber_id: subscriberId, type: "subscribed" }).run();
  db.update(domains).set({ subscribers_count: activeSubscribers(domain.id) }).where(eq(domains.id, domain.id)).run();

  if (!existing) {
    fireWelcomeAutomations(domain.id, domain.workspace_id, subscriberId);
  }

  return NextResponse.json({ ok: true, id: subscriberId });
}

/** M4: event-driven welcome pushes — one campaign per active welcome automation. */
function fireWelcomeAutomations(domainId: number, workspaceId: number, subscriberId: number): void {
  const rows = db
    .select({ id: automations.id, config_json: automations.config_json })
    .from(automations)
    .where(and(eq(automations.workspace_id, workspaceId), eq(automations.domain_id, domainId), eq(automations.type, "welcome_push"), eq(automations.status, "active")))
    .all();
  for (const row of rows) {
    const config = parseAutomationConfig(row.config_json);
    try {
      enqueueAutomationCampaign({
        db,
        workspaceId,
        domainId,
        automationId: row.id,
        subscriberIds: [subscriberId],
        delaySeconds: config.delay_seconds ?? 0,
      });
    } catch {
      // a broken welcome automation must never break the subscribe flow
    }
  }
}

function activeSubscribers(domainId: number): number {
  const row = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .get();
  return row?.value ?? 0;
}
