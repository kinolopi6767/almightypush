import { and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, subscribers } from "@pushpanel/db/schema";
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

  const esc = (v: string | number | null | undefined): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [
    "id,browser,os,device,country,state,domain,subscribe_url,subscribe_at,last_active_at,unsubscribed_at",
    ...rows.map((r) =>
      [r.id, r.browser, r.os, r.device, r.country, r.state, r.domain_name, r.subscribe_url, r.subscribe_at, r.last_active_at, r.unsubscribed_at].map(esc).join(","),
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscribers-analytics.csv"',
    },
  });
}