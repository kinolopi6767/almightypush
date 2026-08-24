import { corsJson, handlePublicOptions } from "@/lib/cors";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, envRateLimit, rateLimitWithHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { emitEvent } from "@/lib/outbound";
import { assertPublicHttpUrl, createCipher, isValidTimezone, parseAutomationConfig, sha256Hex } from "@pushpanel/core";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { automations } from "@pushpanel/db/schema";
import { enqueueAutomationCampaign } from "@pushpanel/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  subscription: z.object({
    endpoint: z
      .string()
      .url()
      .max(2048)
      .refine((u) => u.startsWith("https://"), "endpoint must be https"),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(128) }),
  }),
  device: z.string().trim().max(40).optional().or(z.literal("")),
  browser: z.string().trim().max(40).optional().or(z.literal("")),
  os: z.string().trim().max(40).optional().or(z.literal("")),
  subscribeUrl: z.string().trim().max(500).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  timezone: z.string().trim().max(64).optional().or(z.literal("")),
  locale: z.string().trim().max(20).optional().or(z.literal("")),
  screenWidth: z.coerce.number().int().min(0).max(10000).optional(),
  screenHeight: z.coerce.number().int().min(0).max(10000).optional(),
});

/**
 * Public subscribe endpoint — called by the client SDK.
 * Subscriptions are encrypted at rest; lookups/dedup run on a sha256 hash.
 */
export async function POST(req: Request) {
  // Rate limits BEFORE body parse + DNS-resolving SSRF check: an anonymous
  // sender must not be able to force unbounded req.json() buffering or
  // resolver lookups on hostnames they control.
  const ip = clientIp(req.headers);
  const rl0 = rateLimitWithHeaders(`subscribe:pre:${ip}`, envRateLimit("SUBSCRIBE_RATE_LIMIT", 30), 60_000);
  if (!rl0.allowed) {
    return corsJson({ ok: false, error: "Too many subscribe attempts" }, { status: 429, headers: rateLimitHeaders(rl0, 30) });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return corsJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return corsJson({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const data = parsed.data;
  // LumaPush hyper-precision geo + Smart Send timezone must be valid IANA
  if (data.timezone && !isValidTimezone(data.timezone)) {
    return corsJson({ ok: false, error: "Invalid timezone" }, { status: 400 });
  }
  const rl1 = rateLimitWithHeaders(`subscribe:${data.domainId}:${ip}`, envRateLimit("SUBSCRIBE_RATE_LIMIT", 30), 60_000);
  if (!rl1.allowed) {
    return corsJson({ ok: false, error: "Too many subscribe attempts" }, { status: 429, headers: rateLimitHeaders(rl1, 30) });
  }
  // Global per-domain window — cannot be rotated away by forged IP headers.
  const rl2 = rateLimitWithHeaders(`subscribe:dom:${data.domainId}`, 120, 60_000);
  if (!rl2.allowed) {
    return corsJson({ ok: false, error: "Too many subscribe attempts" }, { status: 429, headers: rateLimitHeaders(rl2, 120) });
  }
  // The endpoint is fetched server-side by the worker on every send — a
  // private/internal address would turn the panel into an SSRF relay.
  const endpointCheck = await assertPublicHttpUrl(data.subscription.endpoint);
  if (!endpointCheck.ok) {
    return corsJson({ ok: false, error: "Invalid push endpoint" }, { status: 400 });
  }

  const [domain] = db
    .select({ id: domains.id, workspace_id: domains.workspace_id, name: domains.name })
    .from(domains)
    .where(and(eq(domains.id, data.domainId), eq(domains.status, "active")))
    .limit(1)
    .all();
  if (!domain) return corsJson({ ok: false, error: "Unknown domain" }, { status: 404 });

  if (!requestOriginAllowed(req, data.subscribeUrl ?? "", domain.name)) {
    return corsJson({ ok: false, error: "subscribe_url does not match the domain" }, { status: 403 });
  }

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

  if (!existing && activeSubscribers(domain.id) >= maxSubscribersPerDomain()) {
    // Bounded growth: a public endpoint can otherwise be fed forever.
    return corsJson({ ok: false, error: "This site has reached its subscriber limit" }, { status: 429 });
  }

  let subscriberId: number;
  if (existing) {
    subscriberId = existing.id;
    db.update(subscribers)
      .set({
        token: enc.encrypt(token),
        last_active_at: now,
        device: data.device || null,
        browser: data.browser || null,
        os: data.os || null,
        city: (data as { city?: string }).city || null,
        timezone: (data as { timezone?: string }).timezone || null,
        locale: (data as { locale?: string }).locale || null,
        screen_width: (data as { screenWidth?: number }).screenWidth ?? null,
        screen_height: (data as { screenHeight?: number }).screenHeight ?? null,
      })
      .where(eq(subscribers.id, existing.id))
      .run();
  } else {
    let inserted;
    try {
      inserted = db
        .insert(subscribers)
        .values({
          domain_id: domain.id,
          token: enc.encrypt(token),
          token_hash: tokenHash,
          provider: "vapid",
          device: data.device || null,
          browser: data.browser || null,
          os: data.os || null,
          city: (data as { city?: string }).city || null,
          timezone: (data as { timezone?: string }).timezone || null,
          locale: (data as { locale?: string }).locale || null,
          screen_width: (data as { screenWidth?: number }).screenWidth ?? null,
          screen_height: (data as { screenHeight?: number }).screenHeight ?? null,
          subscribe_url: data.subscribeUrl || null,
          subscribe_at: now,
          last_active_at: now,
        })
        .run();
    } catch {
      // Two concurrent POSTs with the same endpoint race the active-only
      // unique index: one wins, the loser must answer 200 (the subscription
      // exists) instead of 500. Refresh the winner like the existing path.
      const [winner] = db
        .select({ id: subscribers.id })
        .from(subscribers)
        .where(and(eq(subscribers.domain_id, domain.id), eq(subscribers.token_hash, tokenHash), isNull(subscribers.unsubscribed_at)))
        .limit(1)
        .all();
      if (!winner) throw new Error("subscriber insert failed without a winner");
      db.update(subscribers)
        .set({
          token: enc.encrypt(token),
          last_active_at: now,
          device: data.device || null,
          browser: data.browser || null,
          os: data.os || null,
          city: (data as { city?: string }).city || null,
          timezone: (data as { timezone?: string }).timezone || null,
          locale: (data as { locale?: string }).locale || null,
          screen_width: (data as { screenWidth?: number }).screenWidth ?? null,
          screen_height: (data as { screenHeight?: number }).screenHeight ?? null,
        })
        .where(eq(subscribers.id, winner.id))
        .run();
      return corsJson({ ok: true, id: winner.id });
    }
    subscriberId = Number(inserted.lastInsertRowid);
  }

  // Growth charts count these events — re-subscribes (device updates) must
  // not inflate the series.
  if (!existing) {
    db.insert(events).values({ domain_id: domain.id, subscriber_id: subscriberId, type: "subscribed" }).run();
  }
  db.update(domains).set({ subscribers_count: activeSubscribers(domain.id) }).where(eq(domains.id, domain.id)).run();

  if (!existing) {
    fireWelcomeAutomations(domain.id, domain.workspace_id, subscriberId);
  }

  emitEvent("subscribed", {
    domain_id: domain.id,
    subscriber_id: subscriberId,
    browser: data.browser || null,
    os: data.os || null,
    device: data.device || null,
    country: (data as { country?: string }).country || null,
  });

  return corsJson({ ok: true, id: subscriberId });
}

/**
 * Origin enforcement for the subscribe endpoint (m9):
 * - When the browser sends an `Origin` header (all cross-origin POSTs do),
 *   it is the strongest signal: the subscribing page must live on the
 *   domain's own host (or a subdomain) or on the panel's own host (the
 *   built-in sandbox demo / self-hosted sites). A site on any other origin
 *   cannot forge this from a browser.
 * - When `Origin` is absent (older clients, non-browser callers), fall back
 *   to validating the client-supplied `subscribe_url` against the same sets.
 *   Such callers can always fabricate the URL, but they are bounded by the
 *   global per-domain rate window above.
 */
function requestOriginAllowed(req: Request, subscribeUrl: string, domainName: string): boolean {
  const pool = new Set<string>();
  const name = domainName.toLowerCase().replace(/^\./, "");
  pool.add(name);
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host) pool.add(host);
  const appUrlHost = appUrlHostname();
  if (appUrlHost) pool.add(appUrlHost);

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      for (const allowed of pool) {
        if (originHost === allowed || originHost.endsWith(`.${allowed}`)) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  if (!subscribeUrl) return false;
  try {
    const hostname = new URL(subscribeUrl).hostname.toLowerCase();
    for (const allowed of pool) {
      if (hostname === allowed || hostname.endsWith(`.${allowed}`)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** APP_URL origin hostname, when the deployer fixed the panel's public URL. */
function appUrlHostname(): string | null {
  const url = process.env.APP_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** M4/C8: event-driven welcome pushes + drip sequences — one campaign per active automation. */
function fireWelcomeAutomations(domainId: number, workspaceId: number, subscriberId: number): void {
  const rows = db
    .select({ id: automations.id, type: automations.type, config_json: automations.config_json })
    .from(automations)
    .where(
      and(
        eq(automations.workspace_id, workspaceId),
        eq(automations.domain_id, domainId),
        sql`${automations.type} IN ('welcome_push', 'drip')`,
        eq(automations.status, "active"),
      ),
    )
    .all();
  for (const row of rows) {
    const config = parseAutomationConfig(row.config_json);
    try {
      if (row.type === "drip") {
        // Each step becomes its own campaign, delayed from the previous step.
        let cumulativeSeconds = 0;
        for (const step of config.steps ?? []) {
          cumulativeSeconds += (step.delay_days ?? 0) * 86_400;
          enqueueAutomationCampaign({
            db,
            workspaceId,
            domainId,
            automationId: row.id,
            subscriberIds: [subscriberId],
            delaySeconds: cumulativeSeconds,
            payload: { title: step.title, message: step.message, launch_url: step.launch_url },
          });
        }
        continue;
      }
      enqueueAutomationCampaign({
        db,
        workspaceId,
        domainId,
        automationId: row.id,
        subscriberIds: [subscriberId],
        delaySeconds: config.delay_seconds ?? 0,
      });
    } catch {
      // a broken automation must never break the subscribe flow
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

/** Per-domain cap — removed for personal/private single-tenant use: unlimited. */
function maxSubscribersPerDomain(): number {
  const raw = Number(process.env.MAX_SUBSCRIBERS_PER_DOMAIN);
  // Personal use: unlimited by default. Only enforce if env var explicitly set to >0.
  if (!Number.isFinite(raw) || raw <= 0) return Number.POSITIVE_INFINITY;
  return Math.min(Math.floor(raw), 100_000_000);
}

/** CORS preflight for cross-origin SDK/API callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
