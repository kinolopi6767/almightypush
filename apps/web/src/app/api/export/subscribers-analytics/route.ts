import { and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, subscribers } from "@pushpanel/db/schema";
import { csvCell } from "@pushpanel/core";
import { parseSubscriberFilters, subscriberConditions } from "@/lib/subscriber-filters";

export const dynamic = "force-dynamic";

/**
 * E9-adjacent: analytics-filtered subscriber export as RFC-4180 CSV.
 * Same conditions as /dashboard/analytics so the download always matches
 * what is on screen. Token internals stay encrypted (see D11 for the
 * round-trip export).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return new Response("No workspace", { status: 400 });

  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`export:subs:${wsId}:${clientIp(request.headers)}`, 20, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 20) });

  const url = new URL(request.url);
  const filter = parseSubscriberFilters(url.searchParams);
  const where = and(...subscriberConditions(filter, wsId));

  const rows = db
    .select({
      id: subscribers.id,
      browser: subscribers.browser,
      os: subscribers.os,
      device: subscribers.device,
      country: subscribers.country,
      state: subscribers.state,
      subscribe_url: subscribers.subscribe_url,
      subscribe_at: subscribers.subscribe_at,
      last_active_at: subscribers.last_active_at,
      unsubscribed_at: subscribers.unsubscribed_at,
      domain_name: domains.name,
    })
    .from(subscribers)
    .leftJoin(domains, sql`${domains.id} = ${subscribers.domain_id}`)
    .where(where)
    .orderBy(subscribers.id)
    .all();

  // Stream to avoid OOM on 1M subs — batch 1000 rows per pull
  const header = "id,browser,os,device,country,state,domain,subscribe_url,subscribe_at,last_active_at,unsubscribed_at\n";
  const encoder = new TextEncoder();
  // csvCell is formula-injection-safe (see packages/core/csv.ts)
  const esc = (v: string | number | null | undefined): string => csvCell(v === null || v === undefined ? "" : String(v));
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === 0) {
        controller.enqueue(encoder.encode(header));
      }
      const batchSize = 1000;
      const batch = rows.slice(offset, offset + batchSize);
      if (batch.length === 0) {
        controller.close();
        return;
      }
      const chunk = batch.map((r) => [r.id, r.browser, r.os, r.device, r.country, r.state, r.domain_name, r.subscribe_url, r.subscribe_at, r.last_active_at, r.unsubscribed_at].map(esc).join(",")).join("\n");
      controller.enqueue(encoder.encode(chunk + "\n"));
      offset += batch.length;
      if (offset >= rows.length) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers-analytics.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}