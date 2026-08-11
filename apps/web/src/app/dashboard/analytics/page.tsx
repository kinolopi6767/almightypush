import { and, count, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { parseSubscriberFilters, subscriberAnd, subscriberConditions, type SubscriberFilter } from "@/lib/subscriber-filters";
import { GrowthChart, type GrowthPoint } from "./growth-chart";

export const metadata = { title: "Analytics" };

const DIMENSIONS = [
  { key: "device", label: "Device" },
  { key: "browser", label: "Browser" },
  { key: "os", label: "OS" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
] as const;

const inputCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus:border-primary";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) redirect("/setup");

  const params = await searchParams;
  const filter = parseSubscriberFilters(params);
  const andConds = subscriberAnd(filter, wsId);

  const wsDomains = db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(eq(domains.workspace_id, wsId))
    .orderBy(domains.name)
    .all();

  const [totalRow, activeRow, growthRows, heatRows] = [
    db.select({ value: count() }).from(subscribers).where(andConds).get(),
    db
      .select({ value: count() })
      .from(subscribers)
      .where(and(andConds, isNull(subscribers.unsubscribed_at)))
      .get(),
    db
      .select({ date: sql<string>`date(${subscribers.subscribe_at})`, value: sql<number>`count(*)` })
      .from(subscribers)
      .where(andConds)
      .groupBy(sql`date(${subscribers.subscribe_at})`)
      .orderBy(sql`date(${subscribers.subscribe_at}) DESC`)
      .limit(30)
      .all(),
    db
      .select({ hour: sql<string>`strftime('%H', ${events.ts})`, value: sql<number>`count(*)` })
      .from(events)
      .innerJoin(domains, eq(domains.id, events.domain_id))
      .where(and(eq(events.type, "clicked"), eq(domains.workspace_id, wsId)))
      .groupBy(sql`strftime('%H', ${events.ts})`)
      .all(),
  ];

  const growth: GrowthPoint[] = growthRows.map((r) => ({ date: r.date, count: r.value })).reverse();
  const heat = new Map(heatRows.map((r) => [r.hour, r.value]));
  const maxHour = Math.max(1, ...heatRows.map((r) => r.value));

  const breakdowns: { key: string; label: string; rows: { value: string; count: number }[] }[] = DIMENSIONS.map((d) => {
    const dimConds = and(...subscriberConditions(filter, wsId, d.key));
    const rows = db
      .select({ value: sql<string>`COALESCE(${subscribers[d.key]}, 'Unknown')`, count: sql<number>`count(*)` })
      .from(subscribers)
      .where(dimConds)
      .groupBy(sql`COALESCE(${subscribers[d.key]}, 'Unknown')`)
      .orderBy(sql`count(*) DESC`)
      .limit(8)
      .all();
    return { key: d.key, label: d.label, rows };
  });

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && typeof v === "string") exportQuery.set(k, v);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Subscriber growth, audience breakdowns and click timing — filtered in your browser&apos;s history-friendly GET form below.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="f-domain">Domain</label>
          <select id="f-domain" name="domain" className={`ml-2 ${inputCls}`} defaultValue={filter.domainId ?? ""}>
            <option value="">All domains</option>
            {wsDomains.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="f-from">Subscribed from</label>
          <input id="f-from" name="from" type="date" defaultValue={filter.from ?? ""} className={`ml-2 ${inputCls}`} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="f-to">to</label>
          <input id="f-to" name="to" type="date" defaultValue={filter.to ?? ""} className={`ml-2 ${inputCls}`} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="f-show">Status</label>
          <select id="f-show" name="show" className={`ml-2 ${inputCls}`} defaultValue={filter.showOnly}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
          </select>
        </div>
        {DIMENSIONS.map((d) => (
          <div key={d.key}>
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`f-${d.key}`}>{d.label}</label>
            <select id={`f-${d.key}`} name={d.key} className={`ml-2 ${inputCls}`} defaultValue={filter[d.key] ?? ""}>
              <option value="">Any</option>
              {breakdowns.find((b) => b.key === d.key)?.rows.map((r) =>
                r.value === "Unknown" || r.value === "" ? null : (
                  <option key={r.value} value={r.value}>{r.value} ({r.count})</option>
                ),
              )}
            </select>
          </div>
        ))}
        <button type="submit" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Apply
        </button>
        <a
          href={`/api/export/subscribers-analytics?${exportQuery.toString()}`}
          download
          className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
        >
          Export CSV
        </a>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Subscribers (filter)</p>
          <p className="mt-1 text-3xl font-semibold">{totalRow?.value ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-600">{activeRow?.value ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Unsubscribed</p>
          <p className="mt-1 text-3xl font-semibold text-muted-foreground">{(totalRow?.value ?? 0) - (activeRow?.value ?? 0)}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium">Growth — last {growth.length} days</h2>
        {growth.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No subscribers in this window yet.</p>
        ) : (
          <div className="mt-3">
            <GrowthChart data={growth} />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {breakdowns.map((b) => (
          <div key={b.key} className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">By {b.label.toLowerCase()}</h2>
            {b.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing here.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {b.rows.map((r) => (
                  <li key={r.value} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground">{r.value}</span>
                    <span className="ml-3 font-medium">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-medium">Click timing — best send hours (E8)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          All-time click distribution by hour of day across the workspace.
        </p>
        <div className="mt-3 grid grid-cols-12 gap-1.5">
          {Array.from({ length: 24 }, (_, h) => {
            const v = heat.get(String(h).padStart(2, "0")) ?? 0;
            const intensity = v === 0 ? 0 : 0.15 + (v / maxHour) * 0.85;
            return (
              <div key={h} title={`${String(h).padStart(2, "0")}:00 — ${v} clicks`}
                className="flex h-10 items-center justify-center rounded text-[11px] font-medium text-white"
                style={{ backgroundColor: v === 0 ? "hsl(var(--muted))" : `rgba(22, 163, 74, ${intensity})` }}>
                {h}
              </div>
            );
          })}
        </div>
        {heatRows.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Best send times:{" "}
            <span className="font-medium text-foreground">
              {[...heat.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([h]) => `${h}:00`)
                .join(", ")}
            </span>
          </p>
        )}
      </div>
    </>
  );
}

export type AnalyticsFilter = SubscriberFilter;