import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { campaigns, domains, events } from "@pushpanel/db/schema";
import { campaignAnalyticsCsv, type CampaignAnalyticsRow } from "@pushpanel/core";

export const dynamic = "force-dynamic";

/**
 * E9: campaign analytics as an RFC-4180 CSV download. Session-only, rows
 * scoped to the caller's workspace; clicks come from the events table,
 * delivered/failed/per-button from the campaign stats_json.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

  const rows = db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status,
      sent_at: campaigns.sent_at,
      domain_name: domains.name,
      stats_json: campaigns.stats_json,
      buttons_json: campaigns.buttons_json,
    })
    .from(campaigns)
    .leftJoin(domains, eq(domains.id, campaigns.domain_id))
    .where(wsId ? eq(campaigns.workspace_id, wsId) : sql`1=1`)
    .orderBy(sql`${campaigns.id} DESC`)
    .all();

  const clicks = db
    .select({ campaign_id: events.campaign_id, value: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.type, "clicked"))
    .groupBy(events.campaign_id)
    .all();
  const clickMap = new Map(clicks.map((c) => [c.campaign_id, c.value]));

  const analytics: CampaignAnalyticsRow[] = rows.map((r) => {
    const stats = r.stats_json ? (JSON.parse(r.stats_json) as Record<string, unknown>) : {};
    const perButton = (stats.perButton ?? {}) as Record<string, number>;
    let buttons: string[] = [];
    try {
      const parsed = r.buttons_json ? (JSON.parse(r.buttons_json) as { label?: string }[]) : [];
      buttons = Array.isArray(parsed) ? parsed.map((b) => b.label ?? "").filter(Boolean) : [];
    } catch {
      buttons = [];
    }
    return {
      id: r.id,
      title: r.title,
      domain: r.domain_name,
      status: r.status,
      sent_at: r.sent_at,
      delivered: (stats.delivered as number) ?? 0,
      failed: (stats.failed as number) ?? 0,
      clicked: clickMap.get(r.id) ?? 0,
      buttons,
      per_button: perButton,
    };
  });

  const csv = campaignAnalyticsCsv(analytics);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="campaign-analytics.csv"',
    },
  });
}