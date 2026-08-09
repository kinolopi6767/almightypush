import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveries, events, campaigns } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/**
 * Click beacon — the service worker pings this before opening the URL.
 * Records a `clicked` event (the analytics backbone) and redirects.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const { deliveryId } = await params;
  const id = Number(deliveryId);
  if (!Number.isInteger(id)) return NextResponse.json({ ok: false, error: "Bad id" }, { status: 400 });

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
  if (delivery.campaign_id) {
    const [campaign] = db
      .select({ launch_url: campaigns.launch_url })
      .from(campaigns)
      .where(eq(campaigns.id, delivery.campaign_id))
      .limit(1)
      .all();
    targetUrl = campaign?.launch_url ?? null;
  }

  db.insert(events)
    .values({
      domain_id: delivery.domain_id,
      campaign_id: delivery.campaign_id,
      subscriber_id: delivery.subscriber_id,
      type: "clicked",
      meta_json: JSON.stringify({ target_url: targetUrl }),
    })
    .run();

  const location = targetUrl || "/";
  return NextResponse.redirect(location, 302);
}
