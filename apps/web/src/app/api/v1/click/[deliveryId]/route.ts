import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { deliveries, events, campaigns } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/**
 * Click beacon — the service worker pings this before opening the URL.
 * Records a `clicked` event (the analytics backbone) and redirects.
 */
export async function GET(req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  // Public by design (the SW beacon), but bounded: a flood of beacons must
  // not grow the events table without limit.
  const ip = clientIp(req.headers);
  if (!rateLimit(`click:${ip}`, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many clicks" }, { status: 429 });
  }
  if (!rateLimit("click:all", 1200, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many clicks" }, { status: 429 });
  }

  const { deliveryId } = await params;
  const id = Number(deliveryId);
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

  const url = new URL(req.url);
  const btn = url.searchParams.get("btn");
  const btnIndex = btn === null ? null : Number(btn);

  const [delivery] = db
    .select({
      id: deliveries.id,
      domain_id: deliveries.domain_id,
      campaign_id: deliveries.campaign_id,
      subscriber_id: deliveries.subscriber_id,
    })
    .from(deliveries)
    .where(eq(deliveries.id, id))
    .limit(1)
    .all();
  if (!delivery) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

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
    if (campaign?.buttons_json && btnIndex !== null && Number.isInteger(btnIndex)) {
      const buttons = JSON.parse(campaign.buttons_json) as { label: string; url: string }[];
      const pressed = buttons[btnIndex];
      if (pressed) {
        targetUrl = pressed.url;
        buttonLabel = pressed.label;
      }
    }
  }

  db.insert(events)
    .values({
      domain_id: delivery.domain_id,
      campaign_id: delivery.campaign_id,
      subscriber_id: delivery.subscriber_id,
      type: "clicked",
      meta_json: JSON.stringify({ target_url: targetUrl, action: buttonLabel ?? (btnIndex !== null ? String(btnIndex) : null) }),
    })
    .run();

  if (delivery.campaign_id && buttonLabel !== null) bumpButtonStat(delivery.campaign_id, buttonLabel);

  const location = targetUrl || "/";
  return NextResponse.redirect(location, 302);
}

/** Tally a per-button click count into the campaign's stats_json. */
function bumpButtonStat(campaignId: number, label: string) {
  const [campaign] = db.select({ stats_json: campaigns.stats_json }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1).all();
  if (!campaign) return;
  const stats = (campaign.stats_json ? JSON.parse(campaign.stats_json) : {}) as Record<string, number | Record<string, number>>;
  const perButton = (stats.perButton ?? {}) as Record<string, number>;
  perButton[label] = (perButton[label] ?? 0) + 1;
  stats.perButton = perButton;
  db.update(campaigns).set({ stats_json: JSON.stringify(stats) }).where(eq(campaigns.id, campaignId)).run();
}
