import { NextResponse } from "next/server";
import { emitEvent } from "@/lib/outbound";
import { corsJson, handlePublicOptions } from "@/lib/cors";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientIp, rateLimitWithHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { deliveries, events, campaigns } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/**
 * Click beacon — the service worker pings this before opening the URL.
 * Records a `clicked` event (the analytics backbone) and redirects.
 * `?close=1` records a `notification_closed` event instead (no redirect
 * target — returns 204).
 */
export async function GET(req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  // Public by design (the SW beacon), but bounded: a flood of beacons must
  // not grow the events table without limit.
  const ip = clientIp(req.headers);
  const rlIp = rateLimitWithHeaders(`click:${ip}`, 120, 60_000);
  if (!rlIp.allowed) {
    return corsJson({ ok: false, error: "Too many clicks" }, { status: 429, headers: rateLimitHeaders(rlIp, 120) });
  }
  const rlAll = rateLimitWithHeaders("click:all", 1200, 60_000);
  if (!rlAll.allowed) {
    return corsJson({ ok: false, error: "Too many clicks" }, { status: 429, headers: rateLimitHeaders(rlAll, 1200) });
  }

  const { deliveryId } = await params;
  const id = Number(deliveryId);
  if (!Number.isInteger(id)) return corsJson({ ok: false, error: "Bad id" }, { status: 400 });

  const url = new URL(req.url);
  const isClose = url.searchParams.get("close") === "1";
  const btn = url.searchParams.get("btn");
  // Garbage btn values must not become NaN in analytics — null them out.
  const btnIndex = btn === null || btn === "" ? null : Number.isInteger(Number(btn)) ? Number(btn) : null;

  const [delivery] = db
    .select({
      id: deliveries.id,
      domain_id: deliveries.domain_id,
      campaign_id: deliveries.campaign_id,
      subscriber_id: deliveries.subscriber_id,
      variant: deliveries.variant,
    })
    .from(deliveries)
    .where(eq(deliveries.id, id))
    .limit(1)
    .all();
  if (!delivery) return corsJson({ ok: false, error: "Not found" }, { status: 404 });

  if (isClose) {
    recordEvent("notification_closed", delivery, id, { variant: delivery.variant ?? undefined });
    return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  }

  let targetUrl: string | null = null;
  let buttonLabel: string | null = null;
  if (delivery.campaign_id) {
    const [campaign] = db
      .select({ launch_url: campaigns.launch_url, buttons_json: campaigns.buttons_json })
      .from(campaigns)
      .where(eq(campaigns.id, delivery.campaign_id))
      .limit(1)
      .all();
    targetUrl = campaign?.launch_url ?? null;
    // CTA button clicks open the button's own URL and count toward that
    // button's per-button breakdown (E4).
    if (campaign?.buttons_json && btnIndex !== null) {
      try {
        const buttons = JSON.parse(campaign.buttons_json) as { label: string; url: string }[];
        const pressed = buttons[btnIndex];
        if (pressed) {
          targetUrl = pressed.url;
          buttonLabel = pressed.label;
        }
      } catch {
        // corrupt buttons_json — fall back to the launch URL
      }
    }
  }

  // Replay dedupe: the service worker may retry the beacon (network blips),
  // and the mobile SDK sends `btn` as separate beacons. One delivery = one
  // clicked event; duplicates would inflate analytics. ("One click per
  // delivery" is deliberate — later clicks on other buttons re-fire the
  // beacon but don't double-count.)
  const [prior] = db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.delivery_id, id), eq(events.type, "clicked")))
    .limit(1)
    .all();

  if (!prior) {
    try {
      db.insert(events)
        .values({
          domain_id: delivery.domain_id,
          campaign_id: delivery.campaign_id,
          subscriber_id: delivery.subscriber_id,
          delivery_id: id,
          type: "clicked",
          meta_json: JSON.stringify({
            target_url: targetUrl,
            action: buttonLabel ?? (btnIndex !== null ? String(btnIndex) : null),
            variant: delivery.variant ?? undefined,
          }),
        })
        .run();

      if (delivery.campaign_id && buttonLabel !== null) bumpButtonStat(delivery.campaign_id, buttonLabel);
      emitEvent("clicked", {
        domain_id: delivery.domain_id,
        campaign_id: delivery.campaign_id,
        subscriber_id: delivery.subscriber_id,
        delivery_id: id,
        target_url: targetUrl,
        button: buttonLabel,
      });
    } catch {
      // Two beacons raced the partial unique index; the other one won and
      // already counted the click. Still redirect — never fail a redirect.
    }
  }

  // API-created campaigns may have no launch_url at all — a relative "/"
  // would make NextResponse.redirect throw (it validates absolute URLs).
  if (!targetUrl) {
    return corsJson({ ok: true, url: null }, { status: 200 });
  }
  return NextResponse.redirect(targetUrl, 302);
}

function recordEvent(
  type: string,
  delivery: { domain_id: number; campaign_id: number | null; subscriber_id: number | null },
  deliveryId: number,
  meta: Record<string, unknown>,
) {
  try {
    db.insert(events)
      .values({
        domain_id: delivery.domain_id,
        campaign_id: delivery.campaign_id,
        subscriber_id: delivery.subscriber_id,
        delivery_id: deliveryId,
        type,
        meta_json: JSON.stringify(meta),
      })
      .run();
  } catch {
    void 0;
  }
}

/** Tally a per-button click into the campaign's stats_json — atomic single-statement increment (concurrency-safe). */
function bumpButtonStat(campaignId: number, label: string) {
  try {
    // json_set on '$.perButton.<key>' with a JSON-encoded path segment; the
    // read-modify-write JS version dropped increments under concurrent clicks.
    const path = JSON.stringify(`$.perButton.${label.replace(/["\\]/g, "")}`);
    db.update(campaigns)
      .set({
        stats_json: sql`CASE WHEN json_valid(${campaigns.stats_json}) AND json_extract(${campaigns.stats_json}, ${path}) IS NOT NULL
          THEN json_set(${campaigns.stats_json}, ${path}, json_extract(${campaigns.stats_json}, ${path}) + 1)
          ELSE json_set(json_set(COALESCE(${campaigns.stats_json}, '{}'), '$.perButton', json_object()), ${path}, 1) END`,
      })
      .where(eq(campaigns.id, campaignId))
      .run();
  } catch {
    void 0;
  }
}

/** CORS preflight — the SW beacon may be cross-origin when APP_URL is unset. */
export async function OPTIONS() {
  return handlePublicOptions();
}
