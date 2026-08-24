import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveries, domains, events, subscribers } from "@pushpanel/db/schema";
import { TestPushForm } from "../test-push-form";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CopyButton } from "@/components/copy-button";

export const metadata = { title: "Domain" };

interface Props {
  params: Promise<{ id: string }>;
}

const DELIVERY_TONE: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  delivered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  queued: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  failed: "bg-destructive/10 text-destructive",
};

export default async function DomainDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;

  const { id } = await params;
  const domainId = Number(id);
  if (!Number.isInteger(domainId)) notFound();

  // Ownership: the domain must belong to the caller's workspace.
  const [domain] = workspaceId
    ? db.select().from(domains).where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId))).limit(1).all()
    : [];
  if (!domain) notFound();

  const [subsRow] = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .all();
  const activeSubs = subsRow?.value ?? 0;

  const recentDeliveries = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      error: deliveries.error,
      sent_at: deliveries.sent_at,
    })
    .from(deliveries)
    .where(eq(deliveries.domain_id, domainId))
    .orderBy(desc(deliveries.id))
    .limit(5)
    .all();

  const [clicksRow] = await db
    .select({ value: count() })
    .from(events)
    .where(and(eq(events.domain_id, domainId), eq(events.type, "clicked")))
    .all();

  // Opt-in funnel (30d): prompt_shown → allowed / denied / dismissed.
  const funnelRows = await db
    .select({ type: events.type, value: count() })
    .from(events)
    .where(
      and(
        eq(events.domain_id, domainId),
        sql`${events.type} IN ('prompt_shown','prompt_allowed','prompt_denied','prompt_dismissed')`,
        sql`${events.ts} >= ${new Date(Date.now() - 30 * 86_400_000).toISOString()}`,
      ),
    )
    .groupBy(events.type)
    .all();
  const funnel = Object.fromEntries(funnelRows.map((r) => [r.type, r.value])) as Record<string, number>;

  let config: { publicKey?: string; subject?: string } = {};
  try {
    config = domain.provider_config_json ? JSON.parse(domain.provider_config_json) : {};
  } catch {
    config = {};
  }

  // Real panel origin (never "YOUR-PANEL-HOST") — the snippet must work as-is.
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const snippet = `<script src="${baseUrl}/sdk/pushpanel-sdk.js"></script>
<script>
  PushPanel.init({
    domain: ${domain.id},
    publicKey: "${config.publicKey ?? ""}",
    baseUrl: "${baseUrl}",
    serviceWorkerPath: "/sw.js"
  });
</script>`;

  return (
    <>
      <div className="rise">
        <Link
          href="/dashboard/domains"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Domains
        </Link>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {domain.name}
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {domain.status}
              </span>
            </span>
          }
          description={`Created ${new Date(domain.created_at).toLocaleDateString()} · ${domain.provider.toUpperCase()} signing`}
          actions={
            <Link
              href={`/dashboard/domains/${domainId}/subscribers`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-[background-color,box-shadow,transform] hover:bg-primary-hover active:scale-[0.98]"
            >
              Subscribers →
            </Link>
          }
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rise">
          <StatCard label="Active subscribers" value={activeSubs.toLocaleString()} tone="primary" />
        </div>
        <div className="rise rise-1">
          <StatCard label="Clicks" value={(clicksRow?.value ?? 0).toLocaleString()} tone="amber" />
        </div>
        <div className="rise rise-2">
          <StatCard
            label="Recent deliveries"
            value={recentDeliveries.length}
            tone="emerald"
            hint={funnelRows.length > 0 ? undefined : "No opt-in data yet"}
          />
        </div>
      </div>

      {funnelRows.length > 0 && (
        <div className="surface rise rise-1 mt-4 rounded-xl p-5">
          <p className="kicker text-muted-foreground">Opt-in funnel · 30 days</p>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            {[
              ["Prompt shown", funnel.prompt_shown ?? 0, "text-foreground"],
              ["Allowed", funnel.prompt_allowed ?? 0, "text-emerald-600 dark:text-emerald-400"],
              ["Denied", funnel.prompt_denied ?? 0, "text-destructive"],
              ["Dismissed", funnel.prompt_dismissed ?? 0, "text-muted-foreground"],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="leading-tight">
                <p className={`tabular text-xl font-semibold ${cls}`}>{(value as number).toLocaleString()}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
            {(funnel.prompt_shown ?? 0) > 0 && (
              <div className="leading-tight">
                <p className="tabular text-xl font-semibold text-primary">
                  {Math.round(((funnel.prompt_allowed ?? 0) / (funnel.prompt_shown ?? 1)) * 100)}%
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Grant rate</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Integration — the primary action on this page */}
          <section className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold tracking-tight">Integration snippet</h2>
              <CopyButton value={snippet} label="Copy snippet" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste into your site&apos;s HTML before{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">&lt;/head&gt;</code>. The SDK asks for
              permission, registers the service worker and reports subscriptions back to this panel.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3.5 text-xs leading-relaxed">{snippet}</pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Prefer to see it live? Open the sandbox demo:{" "}
              <Link href={`/demo?domain=${domain.id}`} className="font-medium text-primary hover:underline">
                /demo?domain={domain.id}
              </Link>
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold tracking-tight">VAPID public key</h2>
              {config.publicKey && <CopyButton value={config.publicKey} label="Copy key" />}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              The public half of this domain&apos;s keypair. The private half is encrypted at rest with{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">APP_ENC_KEY</code>.
            </p>
            <code className="mt-3 block break-all rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              {config.publicKey || "(generating…)"}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Keys are per-domain and immutable for deliverability — re-create the domain to rotate.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-semibold tracking-tight">Recent deliveries</h2>
            <ul className="mt-3 divide-y divide-border/60 text-sm">
              {recentDeliveries.length === 0 && (
                <li className="py-3 text-muted-foreground">Nothing sent yet — try the test push form.</li>
              )}
              {recentDeliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DELIVERY_TONE[d.status] ?? "bg-accent"}`}>
                    {d.status}
                  </span>
                  <span className="text-muted-foreground">delivery #{d.id}</span>
                  {d.error && <span className="truncate text-xs text-destructive">{d.error}</span>}
                  {d.sent_at && (
                    <span className="ml-auto shrink-0 text-xs tabular text-muted-foreground">
                      {new Date(d.sent_at).toLocaleTimeString()}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <TestPushForm domainId={domain.id} />
      </div>
    </>
  );
}
