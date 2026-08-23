import { corsJson, handlePublicOptions } from "@/lib/cors";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, domains, events, subscribers } from "@pushpanel/db/schema";
import { requireApiKey, domainAllowed } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * H7: analytics via REST. GET /api/v1/stats
 * Query params: domain (id or name), from (YYYY-MM-DD), to (YYYY-MM-DD).
 * Returns workspace-scoped totals, a daily growth/send series and the
 * per-campaign rollup — the same numbers the dashboard shows.
 */
export async function GET(req: Request) {
  const auth = requireApiKey(req.headers);
  if (!auth.ok) return corsJson({ ok: false, error: auth.error }, { status: auth.status });
  const { workspaceId } = auth.context;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  // Validate before it reaches the SQL: garbage or fake dates (2025-02-31)
  // must fail loudly, not silently skew the aggregates.
  const isRealDate = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  if ((fromParam && !isRealDate(fromParam)) || (toParam && !isRealDate(toParam))) {
    return corsJson({ ok: false, error: "from/to must be real dates (YYYY-MM-DD)" }, { status: 400 });
  }
  const from = fromParam ?? null;
  const to = toParam ?? null;
  const domainParam = url.searchParams.get("domain");

  let domainId: number | null = null;
  if (domainParam) {
    const domain = /^\d+$/.test(domainParam)
      ? db.select({ id: domains.id, name: domains.name }).from(domains).where(and(eq(domains.id, Number(domainParam)), eq(domains.workspace_id, workspaceId))).limit(1).all()
      : db.select({ id: domains.id, name: domains.name }).from(domains).where(and(eq(domains.name, domainParam), eq(domains.workspace_id, workspaceId))).limit(1).all();
    if (domain.length === 0) return corsJson({ ok: false, error: "Domain not found" }, { status: 404 });
    if (!domainAllowed(auth.context, domain[0]!.id)) {
      return corsJson({ ok: false, error: "Domain not covered by this key" }, { status: 403 });
    }
    domainId = domain[0]!.id;
  } else if (auth.context.domainId !== null) {
    domainId = auth.context.domainId;
  }

  let wsDomains = db
    .select({ id: domains.id, name: domains.name, status: domains.status })
    .from(domains)
    .where(eq(domains.workspace_id, workspaceId))
    .orderBy(domains.name)
    .all();

  // Domain-scoped keys must not learn sibling domain names/status.
  if (auth.context.domainId !== null) {
    wsDomains = wsDomains.filter((d) => d.id === auth.context.domainId);
  }

  const wsDomainIds = wsDomains.map((d) => d.id);

  // Empty workspace (no domains yet) -> IN () is invalid SQL; short-circuit to zero rows.
  if (wsDomainIds.length === 0 && domainId === null) {
    return corsJson({
      ok: true,
      generated_at: new Date().toISOString(),
      query: { from: from ?? null, to: to ?? null, domain_id: domainId },
      totals: { subscribers: 0, active: 0, unsubscribed: 0, delivered: 0, clicked: 0, campaigns: 0, domains: 0 },
      domains: wsDomains,
      series: { growth: [], activity: [] },
      campaigns: [],
    });
  }

  const effectiveIds = domainId !== null ? [domainId] : wsDomainIds;

  const subDate = (col: typeof subscribers) =>
    sql`${col.domain_id} IN (${sql.join(effectiveIds.map((id) => sql`${id}`), sql`, `)})${from ? sql` AND date(${col.subscribe_at}) >= ${from}` : sql``}${to ? sql` AND date(${col.subscribe_at}) <= ${to}` : sql``}`;

  const evtDate = (type: string) =>
    sql`${events.domain_id} IN (${sql.join(effectiveIds.map((id) => sql`${id}`), sql`, `)}) AND ${events.type} = ${type}${from ? sql` AND date(${events.ts}) >= ${from}` : sql``}${to ? sql` AND date(${events.ts}) <= ${to}` : sql``}`;

  const [subs] = db.select({ value: count() }).from(subscribers).where(subDate(subscribers)).all();
  const [active] = db
    .select({ value: count() })
    .from(subscribers)
    .where(sql`${subDate(subscribers)} AND ${subscribers.unsubscribed_at} IS NULL`)
    .all();
  const [delivered] = db.select({ value: count() }).from(events).where(evtDate("delivered")).all();
  const [clicked] = db.select({ value: count() }).from(events).where(evtDate("clicked")).all();
  const [campaignsRow] = db
    .select({ value: count() })
    .from(campaigns)
    .where(sql`${campaigns.workspace_id} = ${workspaceId}${domainId !== null ? sql` AND ${campaigns.domain_id} = ${domainId}` : sql``}`)
    .all();

  const series = db
    .select({
      date: sql<string>`date(${events.ts})`,
      delivered: sql<number>`sum(case when ${events.type} = 'delivered' then 1 else 0 end)`,
      clicked: sql<number>`sum(case when ${events.type} = 'clicked' then 1 else 0 end)`,
    })
    .from(events)
    .where(
      sql`${events.domain_id} IN (${sql.join(effectiveIds.map((id) => sql`${id}`), sql`, `)}) AND ${events.type} IN ('delivered','clicked')${from ? sql` AND date(${events.ts}) >= ${from}` : sql``}${to ? sql` AND date(${events.ts}) <= ${to}` : sql``} AND date(${events.ts}) >= date('now','-29 days')`,
    )
    .groupBy(sql`date(${events.ts})`)
    .orderBy(sql`date(${events.ts})`)
    .all();

  const growth = db
    .select({ date: sql<string>`date(${subscribers.subscribe_at})`, value: sql<number>`count(*)` })
    .from(subscribers)
    .where(sql`${subDate(subscribers)} AND date(${subscribers.subscribe_at}) >= date('now','-29 days')`)
    .groupBy(sql`date(${subscribers.subscribe_at})`)
    .orderBy(sql`date(${subscribers.subscribe_at})`)
    .all();

  const perCampaign = db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      status: campaigns.status,
      sent_at: campaigns.sent_at,
      domain_id: campaigns.domain_id,
      domain_name: domains.name,
      stats_json: campaigns.stats_json,
    })
    .from(campaigns)
    .leftJoin(domains, eq(domains.id, campaigns.domain_id))
    .where(sql`${campaigns.workspace_id} = ${workspaceId}${domainId !== null ? sql` AND ${campaigns.domain_id} = ${domainId}` : sql``}`)
    .orderBy(sql`${campaigns.id} DESC`)
    .limit(100)
    .all();

  const clicksByCampaign = db
    .select({ campaign_id: events.campaign_id, value: sql<number>`count(*)` })
    .from(events)
    .where(
      and(
        eq(events.type, "clicked"),
        perCampaign.length > 0 ? inArray(events.campaign_id, perCampaign.map((c) => c.id)) : sql`1=0`,
      ),
    )
    .groupBy(events.campaign_id)
    .all();
  const clickMap = new Map(clicksByCampaign.map((c) => [c.campaign_id, c.value]));

  return corsJson({
    ok: true,
    generated_at: new Date().toISOString(),
    query: { from: from ?? null, to: to ?? null, domain_id: domainId },
    totals: {
      subscribers: subs?.value ?? 0,
      active: active?.value ?? 0,
      unsubscribed: (subs?.value ?? 0) - (active?.value ?? 0),
      delivered: delivered?.value ?? 0,
      clicked: clicked?.value ?? 0,
      campaigns: campaignsRow?.value ?? 0,
      domains: wsDomains.length,
    },
    domains: wsDomains,
    series: {
      growth: growth.map((g) => ({ date: g.date, subscribers: g.value })),
      activity: series.map((s) => ({ date: s.date, delivered: s.delivered, clicked: s.clicked })),
    },
    campaigns: perCampaign.map((c) => {
      let stats: Record<string, unknown> = {};
      try {
        stats = c.stats_json ? (JSON.parse(c.stats_json) as Record<string, unknown>) : {};
      } catch {
        stats = {};
      }
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        domain: c.domain_name,
        sent_at: c.sent_at,
        delivered: (stats.delivered as number) ?? 0,
        failed: (stats.failed as number) ?? 0,
        clicked: clickMap.get(c.id) ?? 0,
      };
    }),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

/** CORS preflight for cross-origin SDK/API callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
