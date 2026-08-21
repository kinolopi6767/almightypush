import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { campaigns, domains, events } from "@pushpanel/db/schema";
import { STATUS_STYLES, statusLabel } from "./status";

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

export default async function CampaignsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) redirect("/setup");

  // Paginated: limit 50 to keep 1M campaigns fast (was unbounded — OOM at 1M)
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

  // Clicks only for visible page — avoids N=1M inArray OOM
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every send is one campaign — delivered by the worker with your domain&apos;s VAPID keypair.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/campaigns"
            download
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
          >
            Export analytics (CSV)
          </a>
          <Link
            href="/dashboard/campaigns/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            New campaign
          </Link>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-sm font-medium">No campaigns yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create one to push to your subscribers — all unlimited for personal use.</p>
          </div>
        )}
        {rows.map((row) => {
          const stats = parseStats(row.stats_json);
          const clickCount = clicks.find((c) => c.campaign_id === row.id)?.value ?? 0;
          return (
            <Link
              key={row.id}
              href={`/dashboard/campaigns/${row.id}`}
              className="card-lift flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.title}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {row.domain_name ?? "multi-domain"} · {statusLabel(row.status)} ·{" "}
                  {row.schedule_at
                    ? `scheduled ${new Date(row.schedule_at).toLocaleString()}`
                    : `sent ${row.sent_at ? new Date(row.sent_at).toLocaleString() : "—"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {stats.delivered ?? 0} delivered · {clickCount} clicks
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground"}`}>
                  {row.status}
                </span>
              </div>
            </Link>
          );
        })}
        {rows.length === 50 && (
          <p className="text-center text-xs text-muted-foreground">Showing latest 50 · use search on detail or export CSV for all.</p>
        )}
      </div>
    </>
  );
}
