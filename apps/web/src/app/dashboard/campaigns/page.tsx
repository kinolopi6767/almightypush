import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { campaigns, domains, events } from "@pushpanel/db/schema";
import { statusLabel } from "./status";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { QuickPushForm } from "./quick-push-form";

export const metadata = { title: "Campaigns" };

function parseStats(json: string | null): Record<string, number> {
 if (!json) return {};
 try {
  const parsed = JSON.parse(json) as unknown;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
 } catch {
  return {};
 }
}

const STATUS_BADGE: Record<string, string> = {
 done: "badge-ok",
 sending: "badge-info",
 scheduled: "badge-warn",
 paused: "badge-warn",
 failed: "badge-danger",
 cancelled: "badge-neutral",
 draft: "badge-neutral",
};

export default async function CampaignsPage() {
 const session = await auth();
 if (!session?.user) redirect("/login");
 const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
 if (!wsId) redirect("/setup");

 const rows = await db
  .select({
   id: campaigns.id,
   title: campaigns.title,
   status: campaigns.status,
   schedule_at: campaigns.schedule_at,
   sent_at: campaigns.sent_at,
   stats_json: campaigns.stats_json,
   domain_id: campaigns.domain_id,
   domain_name: domains.name,
  })
  .from(campaigns)
  .leftJoin(domains, eq(domains.id, campaigns.domain_id))
  .where(eq(campaigns.workspace_id, wsId))
  .orderBy(desc(campaigns.id))
  .limit(50)
  .all();

 const clicks = rows.length
  ? await db
    .select({ campaign_id: events.campaign_id, value: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.type, "clicked"), inArray(events.campaign_id, rows.map((r) => r.id))))
    .groupBy(events.campaign_id)
    .all()
  : [];

 return (
  <>
   <PageHeader
    eyebrow="Operate · Campaigns"
    title="Campaigns"
    description="Every send is one campaign — delivered by the worker with your domain's VAPID keypair."
    actions={
     <>
      <a href="/api/export/campaigns" download className="btn btn-secondary">
       Export CSV
      </a>
      <Link href="/dashboard/campaigns/new" className="btn btn-primary">
       New campaign
      </Link>
     </>
    }
   />

   <div className="mt-5 space-y-4">
    <QuickPushForm />
    {rows.length === 0 && (
     <EmptyState
      icon={<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />}
      title="No campaigns yet"
      description="Create one to push to your subscribers — unlimited sends, personal edition."
      ctaLabel="New campaign"
      ctaHref="/dashboard/campaigns/new"
     />
    )}
    {rows.length > 0 && (
     <div className="table-wrap">
      <table className="console-table">
       <thead>
        <tr>
         <th>Campaign</th>
         <th>Status</th>
         <th className="num">Delivered</th>
         <th className="num">Clicks</th>
         <th>When</th>
        </tr>
       </thead>
       <tbody>
        {rows.map((row) => {
         const stats = parseStats(row.stats_json);
         const clickCount = clicks.find((c) => c.campaign_id === row.id)?.value ?? 0;
         return (
          <tr key={row.id} data-testid={`row-campaign-${row.id}`} data-entity="campaign">
           <td>
            <Link href={`/dashboard/campaigns/${row.id}`} className="font-medium hover:text-[var(--brand)]">
             {row.title}
            </Link>
            <span className="block truncate text-[12px] text-[var(--ink-3)]">{row.domain_name ?? "multi-domain"}</span>
           </td>
           <td>
            <span className={`badge ${STATUS_BADGE[row.status] ?? "badge-neutral"}`}>
             <span className="badge-dot" aria-hidden />
             {statusLabel(row.status)}
            </span>
           </td>
           <td className="num tabular">{stats.delivered ?? 0}</td>
           <td className="num tabular">{clickCount}</td>
           <td className="tabular whitespace-nowrap text-[12.5px] text-[var(--ink-2)]">
            {row.schedule_at
             ? new Date(row.schedule_at).toLocaleString()
             : row.sent_at
              ? new Date(row.sent_at).toLocaleString()
              : "—"}
           </td>
          </tr>
         );
        })}
       </tbody>
      </table>
     </div>
    )}
    {rows.length === 50 && (
     <p className="mt-3 text-center text-xs text-[var(--ink-3)]">Showing latest 50 · open a campaign for per-delivery stats or export CSV for all.</p>
    )}
   </div>
  </>
 );
}
