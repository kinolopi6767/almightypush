import { and, count, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { parseSubscriberFilters, subscriberAnd, subscriberConditions, type SubscriberFilter } from "@/lib/subscriber-filters";
import { GrowthChart, type GrowthPoint } from "./growth-chart";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Analytics" };

const DIMENSIONS = [
 { key: "device", label: "Device" },
 { key: "browser", label: "Browser" },
 { key: "os", label: "OS" },
 { key: "country", label: "Country" },
 { key: "state", label: "State" },
 { key: "city", label: "City" },
] as const;

const inputCls =
 "input min-w-0";

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

 // Batch queries: keep each fast with proper indexes; growth/heat use new idx_events_subscriber_type etc.
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
   .where(sql`${andConds} AND ${subscribers.subscribe_at} IS NOT NULL`)
   .groupBy(sql`date(${subscribers.subscribe_at})`)
   .orderBy(sql`date(${subscribers.subscribe_at}) DESC`)
   .limit(30)
   .all(),
  db
   .select({ hour: sql<string>`strftime('%H', ${events.ts})`, value: sql<number>`count(*)` })
   .from(events)
   .innerJoin(domains, eq(domains.id, events.domain_id))
   .where(
    and(
     eq(events.type, "clicked"),
     eq(domains.workspace_id, wsId),
     // Bounded window: an all-time GROUP BY over millions of events runs
     // synchronously on the web event loop. 90d is the planning horizon
     // for "best send hours" anyway.
     sql`${events.ts} >= date('now', '-90 days')`,
    ),
   )
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
   <PageHeader eyebrow="Operate · Analytics"
    title="Analytics"
    description="Subscriber growth, audience breakdowns and click timing — filtered in your browser's history-friendly GET form below."
   />

   <form method="get" className="panel mt-6 flex flex-wrap items-end gap-3 rounded-md p-5">
    <div className="flex flex-col gap-1.5 min-w-0">
     <label className="text-xs font-medium text-muted-foreground" htmlFor="f-domain">Domain</label>
     <select id="f-domain" name="domain" className={inputCls} defaultValue={filter.domainId ?? ""}>
      <option value="">All domains</option>
      {wsDomains.map((d) => (
       <option key={d.id} value={d.id}>{d.name}</option>
      ))}
     </select>
    </div>
    <div className="flex flex-col gap-1.5 min-w-0">
     <label className="text-xs font-medium text-muted-foreground" htmlFor="f-from">Subscribed from</label>
     <input id="f-from" name="from" type="date" defaultValue={filter.from ?? ""} className={inputCls} />
    </div>
    <div className="flex flex-col gap-1.5 min-w-0">
     <label className="text-xs font-medium text-muted-foreground" htmlFor="f-to">to</label>
     <input id="f-to" name="to" type="date" defaultValue={filter.to ?? ""} className={inputCls} />
    </div>
    <div className="flex flex-col gap-1.5 min-w-0">
     <label className="text-xs font-medium text-muted-foreground" htmlFor="f-show">Status</label>
     <select id="f-show" name="show" className={inputCls} defaultValue={filter.showOnly}>
      <option value="all">All</option>
      <option value="active">Active</option>
      <option value="unsubscribed">Unsubscribed</option>
     </select>
    </div>
    {DIMENSIONS.map((d) => (
     <div key={d.key} className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`f-${d.key}`}>{d.label}</label>
      <select id={`f-${d.key}`} name={d.key} className={inputCls} defaultValue={filter[d.key] ?? ""}>
       <option value="">Any</option>
       {breakdowns.find((b) => b.key === d.key)?.rows.map((r) =>
        r.value === "Unknown" || r.value === "" ? null : (
         <option key={r.value} value={r.value}>{r.value} ({r.count})</option>
        ),
       )}
      </select>
     </div>
    ))}
    <button type="submit" className="btn btn-primary">
     Apply
    </button>
    <a
     href={`/api/export/subscribers-analytics?${exportQuery.toString()}`}
     download
     className="btn btn-secondary"
    >
     Export CSV
    </a>
   </form>

   <div className="mt-6 grid gap-4 sm:grid-cols-3">
    <div className="panel rounded-md p-5">
     <p className="micro-label">Subscribers (filter)</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight">{totalRow?.value ?? 0}</p>
    </div>
    <div className="panel rounded-md p-5">
     <p className="micro-label">Active</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight text-emerald-600 dark:text-emerald-400">{activeRow?.value ?? 0}</p>
    </div>
    <div className="panel rounded-md p-5">
     <p className="micro-label">Unsubscribed</p>
     <p className="tabular mt-3 text-[30px] font-semibold leading-none tracking-tight text-muted-foreground">{(totalRow?.value ?? 0) - (activeRow?.value ?? 0)}</p>
    </div>
   </div>

   <div className="panel mt-6 rounded-md p-5">
    <h2 className="text-sm font-semibold tracking-tight">Growth — last {growth.length} days</h2>
    {growth.length === 0 ? (
     <p className="py-12 text-center text-sm text-muted-foreground">No subscribers in this window yet.</p>
    ) : (
     <div className="mt-3">
      <GrowthChart data={growth} />
     </div>
    )}
   </div>

   <div className="mt-6 grid gap-4 lg:grid-cols-2">
    {breakdowns.map((b) => {
     const max = Math.max(1, ...b.rows.map((r) => r.count));
     return (
      <div key={b.key} className="panel p-4">
       <h2 className="text-[13px] font-semibold tracking-tight">By {b.label.toLowerCase()}</h2>
       {b.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
       ) : (
        <ul className="mt-4 space-y-3">
         {b.rows.map((r) => (
          <li key={r.value} className="group">
           <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.value}</span>
            <span className="tabular shrink-0 text-xs font-medium text-muted-foreground">{r.count.toLocaleString()}</span>
           </div>
           <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
             className="h-full rounded-full bg-primary transition-colors duration-200 group-hover:bg-primary-hover"
             style={{ width: `${Math.round((r.count / max) * 100)}%` }}
            />
           </div>
          </li>
         ))}
        </ul>
       )}
      </div>
     );
    })}
   </div>

   <div className="panel mt-6 rounded-md p-5">
    <h2 className="text-sm font-semibold tracking-tight">Click timing — best send hours (E8)</h2>
    <p className="mt-1 text-xs text-muted-foreground">
     All-time click distribution by hour of day across the workspace.
    </p>
    <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
     {Array.from({ length: 24 }, (_, h) => {
      const v = heat.get(String(h).padStart(2, "0")) ?? 0;
      const intensity = v === 0 ? 0 : 0.15 + (v / maxHour) * 0.85;
      return (
       <div key={h} title={`${String(h).padStart(2, "0")}:00 — ${v} clicks`}
        className={`flex h-10 items-center justify-center rounded-md text-[11px] font-medium tabular transition-transform duration-150 hover:scale-105 ${v === 0 ? "text-muted-foreground" : "text-primary-foreground"}`}
        style={{ backgroundColor: v === 0 ? "var(--muted)" : `color-mix(in oklab, var(--primary) ${Math.round(intensity * 100)}%, transparent)` }}>
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