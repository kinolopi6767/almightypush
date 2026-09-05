import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { campaigns, domains, events } from "@pushpanel/db/schema";
import { csvCell, type CampaignAnalyticsRow } from "@pushpanel/core";

export const dynamic = "force-dynamic";

/**
 * E9: campaign analytics as an RFC-4180 CSV download. Session-only, rows
 * scoped to the caller's workspace; clicks come from the events table,
 * delivered/failed/per-button from the campaign stats_json.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return new Response("No workspace", { status: 400 });

  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`export:campaigns:${wsId}:${clientIp(req.headers)}`, 20, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 20) });

  // True keyset pagination: campaigns AND their click aggregates are pulled
  // in bounded batches inside the stream. Materializing everything first
  // would OOM at the advertised 1M scale, and feeding all campaign ids into
  // one `inArray` exceeds SQLite's host-parameter limit past ~32k rows.
  const header = "id,title,domain,status,sent_at,delivered,failed,clicked,click_rate_pct,buttons,clicks_per_button\n";
  const encoder = new TextEncoder();
  const batchSize = 500;
  let lastId = Number.MAX_SAFE_INTEGER;
  let sentHeader = false;
  let done = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (done) {
        controller.close();
        return;
      }
      if (!sentHeader) {
        controller.enqueue(encoder.encode(header));
        sentHeader = true;
      }
      const batch = db
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
        .where(and(eq(campaigns.workspace_id, wsId), sql`${campaigns.id} < ${lastId}`))
        .orderBy(sql`${campaigns.id} DESC`)
        .limit(batchSize)
        .all();
      if (batch.length === 0) {
        done = true;
        controller.close();
        return;
      }

      // Clicks for exactly this batch: GROUP BY over an id range (index
      // friendly, bounded parameters) instead of one giant IN list.
      const minId = batch[batch.length - 1]!.id;
      const maxId = batch[0]!.id;
      const clicks = db
        .select({ campaign_id: events.campaign_id, value: sql<number>`count(*)` })
        .from(events)
        .where(and(eq(events.type, "clicked"), sql`${events.campaign_id} BETWEEN ${minId} AND ${maxId}`))
        .groupBy(events.campaign_id)
        .all();
      const clickMap = new Map(clicks.map((c) => [c.campaign_id, c.value]));

      const analytics: CampaignAnalyticsRow[] = batch.map((r) => {
        let stats: Record<string, unknown> = {};
        try {
          stats = r.stats_json ? (JSON.parse(r.stats_json) as Record<string, unknown>) : {};
        } catch {
          stats = {};
        }
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

      // Reuse csvCell (formula-injection-safe) for every cell
      const lines = analytics
        .map((r) => {
          const clicksPerButton = Object.keys(r.per_button).length > 0 ? JSON.stringify(r.per_button) : "";
          const rate = r.delivered > 0 ? ((r.clicked / r.delivered) * 100).toFixed(2) : "";
          const row = [r.id, r.title, r.domain, r.status, r.sent_at, r.delivered, r.failed, r.clicked, rate, r.buttons.join(" | "), clicksPerButton]
            .map((v) => csvCell(v === null || v === undefined ? "" : String(v)))
            .join(",");
          return row;
        })
        .join("\r\n");
      controller.enqueue(encoder.encode(lines + "\r\n"));
      lastId = minId;
      if (batch.length < batchSize) {
        done = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="campaign-analytics.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}