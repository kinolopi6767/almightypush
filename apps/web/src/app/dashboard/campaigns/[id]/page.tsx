import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
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

function parseJson<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export default async function CampaignDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) redirect("/setup");

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId)) notFound();

  const [campaign] = db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspace_id, wsId)))
    .limit(1)
    .all();
  if (!campaign) notFound();

  const [domain] = db
    .select({ name: domains.name })
    .from(domains)
    .where(eq(domains.id, campaign.domain_id ?? -1))
    .limit(1)
    .all();

  const audienceRow = campaign.domain_id
    ? db.select({ value: count() }).from(subscribers).where(and(eq(subscribers.domain_id, campaign.domain_id), isNull(subscribers.unsubscribed_at))).get()
    : null;

  const [clickedRow] = db
    .select({ value: count() })
    .from(events)
    .where(and(eq(events.campaign_id, campaignId), eq(events.type, "clicked")))
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

  const stats = parseJson<Record<string, number>>(campaign.stats_json, {});
  const delivered = stats.delivered ?? 0;
  const perButton = parseJson<{ perButton?: Record<string, number> }>(campaign.stats_json, {}).perButton ?? {};
  const buttons = parseJson<{ label: string; url: string }[]>(campaign.buttons_json, []);

  // E7: A/B outcome — per-variant delivered/clicked read from the events
  // (the sender tags delivered events, the click route tags clicks).
  const abRows = campaign.title_b
    ? db
        .select({
          variant: sql<string>`json_extract(${events.meta_json}, '$.variant')`,
          type: events.type,
          value: count(),
        })
        .from(events)
        .where(sql`${events.campaign_id} = ${campaignId} AND ${events.type} IN ('delivered','clicked') AND json_extract(${events.meta_json}, '$.variant') IS NOT NULL`)
        .groupBy(sql`json_extract(${events.meta_json}, '$.variant')`, events.type)
        .all()
    : [];
  const ab = { a: { delivered: 0, clicked: 0 }, b: { delivered: 0, clicked: 0 } };
  for (const r of abRows) {
    if (r.variant === "a" || r.variant === "b") ab[r.variant][r.type === "clicked" ? "clicked" : "delivered"] = r.value;
  }
  const abWinner =
    ab.a.delivered > 0 || ab.b.delivered > 0
      ? ab.a.delivered * ab.b.clicked === ab.b.delivered * ab.a.clicked
        ? null
        : ab.a.delivered * ab.b.clicked > ab.b.delivered * ab.a.clicked
          ? "a"
          : "b"
      : null;

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

      {campaign.title_b && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {(["a", "b"] as const).map((v) => {
            const title = v === "a" ? campaign.title : campaign.title_b;
            const isWinner = abWinner === v;
            return (
              <div key={v} className={`rounded-xl border bg-card p-5 ${isWinner ? "ring-2 ring-emerald-500" : ""}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Variant {v.toUpperCase()}</h2>
                  {isWinner && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Winner
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{title}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Delivered</p>
                    <p className="mt-1 text-2xl font-semibold">{ab[v].delivered}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Clicked</p>
                    <p className="mt-1 text-2xl font-semibold">{ab[v].clicked}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Click rate: {ab[v].delivered > 0 ? `${((ab[v].clicked / ab[v].delivered) * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
            );
          })}
        </div>
      )}

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
