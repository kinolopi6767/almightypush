import Link from "next/link";
import { notFound } from "next/navigation";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { campaigns, deliveries, domains, events, subscribers } from "@pushpanel/db/schema";
import { STATUS_STYLES } from "../status";
import { CancelCampaignForm } from "./cancel-form";
import { DuplicateCampaignForm } from "./duplicate-form";
import { LiveFeed } from "@/components/live-feed";

export const metadata = { title: "Campaign" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) notFound();

  const [campaign] = db
    .select()
    .from(campaigns)
    .where(wsId ? sql`${campaigns.id} = ${campaignId} AND ${campaigns.workspace_id} = ${wsId}` : eq(campaigns.id, campaignId))
    .limit(1)
    .all();
  if (!campaign) notFound();

  const [domain] = db
    .select({ name: domains.name })
    .from(domains)
    .where(eq(domains.id, campaign.domain_id ?? -1))
    .limit(1)
    .all();

  const [audienceRow] = db
    .select({ value: count() })
    .from(subscribers)
    .where(sql`${subscribers.domain_id} = ${campaign.domain_id ?? -1} AND ${subscribers.unsubscribed_at} IS NULL`)
    .all();

  const [clickedRow] = db
    .select({ value: count() })
    .from(events)
    .where(sql`${events.campaign_id} = ${campaignId} AND ${events.type} = 'clicked'`)
    .all();

  const deliveryRows = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      error: deliveries.error,
      attempts: deliveries.attempts,
      sent_at: deliveries.sent_at,
      device: subscribers.device,
      browser: subscribers.browser,
    })
    .from(deliveries)
    .leftJoin(subscribers, eq(subscribers.id, deliveries.subscriber_id))
    .where(eq(deliveries.campaign_id, campaignId))
    .orderBy(desc(deliveries.id))
    .limit(20)
    .all();

  const byStatus = new Map<string, number>();
  for (const d of deliveryRows) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);

  const stats = campaign.stats_json ? (JSON.parse(campaign.stats_json) as Record<string, number>) : {};
  const delivered = stats.delivered ?? 0;
  const perButton = (campaign.stats_json ? (JSON.parse(campaign.stats_json) as { perButton?: Record<string, number> }).perButton : undefined) ?? {};
  const buttons = campaign.buttons_json ? (JSON.parse(campaign.buttons_json) as { label: string; url: string }[]) : [];

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/campaigns" className="text-sm text-muted-foreground hover:text-foreground">
          ← Campaigns
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[campaign.status] ?? ""}`}>
          {campaign.status}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Audience", audienceRow?.value ?? 0],
          ["Delivered", delivered],
          ["Clicked", clickedRow?.value ?? 0],
          ["Created", new Date(campaign.created_at).toLocaleDateString()],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Payload</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Message</dt>
                <dd>
                  {campaign.message || <span className="text-muted-foreground">(none)</span>}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Click URL</dt>
                <dd className="truncate">{campaign.launch_url || <span className="text-muted-foreground">(none)</span>}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Domain</dt>
                <dd>{domain?.name ?? campaign.domain_id}</dd>
              </div>
              {campaign.schedule_at && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">Scheduled</dt>
                  <dd>{new Date(campaign.schedule_at).toLocaleString()}</dd>
                </div>
              )}
              {buttons.length > 0 && (
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Buttons</dt>
                  {buttons.map((b, i) => (
                    <dd key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{b.label}</span>
                      <span className="text-muted-foreground">{perButton[b.label] ?? 0} clicks</span>
                    </dd>
                  ))}
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Recent deliveries</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {deliveryRows.length} of the latest — statuses right now:{" "}
              {[...byStatus.entries()].map(([s, n]) => `${s} ${n}`).join(", ") || "none yet"}.
            </p>
            {deliveryRows.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                No deliveries yet — the scheduler enqueues them when the campaign starts.
              </p>
            )}
            <ul className="mt-3 space-y-2 text-sm">
              {deliveryRows.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground">
                    {[d.device, d.browser].filter(Boolean).join(" · ") || `subscriber #${d.id}`} · attempt {d.attempts}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] ?? ""}`}>
                    {d.status}
                  </span>
                  {d.error && <span className="truncate text-xs text-destructive">{d.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <CancelCampaignForm campaignId={campaign.id} status={campaign.status} />
        {["done", "failed", "cancelled", "sent"].includes(campaign.status) && <DuplicateCampaignForm campaignId={campaign.id} />}
      </div>

      <div className="mt-8 max-w-2xl">
        <LiveFeed />
      </div>
    </>
  );
}
