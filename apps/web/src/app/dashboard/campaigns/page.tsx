import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { campaigns, domains, events } from "@pushpanel/db/schema";
import { STATUS_STYLES, statusLabel } from "./status";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

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
    .where(wsId ? eq(campaigns.workspace_id, wsId) : sql`1=1`)
    .orderBy(desc(campaigns.id))
    .all();

  const clicks = await db
    .select({ campaign_id: events.campaign_id, value: sql<number>`count(*)` })
    .from(events)
    .where(eq(events.type, "clicked"))
    .groupBy(events.campaign_id)
    .all();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every send is one campaign — delivered by the worker with your domain&apos;s VAPID keypair.
          </p>
        </div>
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          New campaign
        </Link>
      </div>

      <div className="mt-8 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No campaigns yet — create one to push to your subscribers.
          </div>
        )}
        {rows.map((row) => {
          const stats = row.stats_json ? (JSON.parse(row.stats_json) as Record<string, number>) : {};
          return (
            <Link
              key={row.id}
              href={`/dashboard/campaigns/${row.id}`}
              className="flex items-center justify-between rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50"
            >
              <div>
                <p className="font-medium">{row.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.domain_name ?? "multi-domain"} · {statusLabel(row.status)} ·{" "}
                  {row.schedule_at
                    ? `scheduled ${new Date(row.schedule_at).toLocaleString()}`
                    : `sent ${row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {stats.delivered ?? 0} delivered · {clicks.find((c) => c.campaign_id === row.id)?.value ?? 0} clicks
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? ""}`}>
                  {row.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
