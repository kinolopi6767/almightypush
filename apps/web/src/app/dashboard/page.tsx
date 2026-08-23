import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backups, campaigns, domains, events, settings, subscribers } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LiveFeed } from "@/components/live-feed";
import { StatCard } from "@/components/stat-card";

export const metadata = { title: "Dashboard" };

const ICONS = {
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  click: "M9 9l5 12 1.8-5.2L21 14zM7.2 2.2 8 5.1M5.1 8 2.2 7.2M14 4.1 12 6M6 12l-1.9 2",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  spark: "M12 3l1.9 5.8L19.7 10l-5.8 1.9L12 17.7l-1.9-5.8L4.3 10l5.8-1.2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z",
  cloud: "M17.5 19H9a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 17.5 19z",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) redirect("/setup");

  const [subsRow] = await db
    .select({ value: count() })
    .from(subscribers)
    .innerJoin(domains, eq(subscribers.domain_id, domains.id))
    .where(and(isNull(subscribers.unsubscribed_at), eq(domains.workspace_id, wsId)));

  const [domainsRow] = await db.select({ value: count() }).from(domains).where(eq(domains.workspace_id, wsId));

  const [sentRow] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(and(eq(campaigns.status, "done"), eq(campaigns.workspace_id, wsId)));

  const [clicksRow] = await db
    .select({ value: count() })
    .from(events)
    .innerJoin(domains, eq(domains.id, events.domain_id))
    .where(and(eq(events.type, "clicked"), eq(domains.workspace_id, wsId)));

  const [lastBackup] = wsId
    ? db.select({ created_at: backups.created_at, kind: backups.kind }).from(backups).orderBy(desc(backups.created_at)).limit(1).all()
    : [];
  const gdriveEnabled = wsId
    ? db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_enabled")).get()?.value === "1"
    : false;
  const hasAiKey = wsId ? !!db.select({ value: settings.value }).from(settings).where(eq(settings.key, "secret:ai_api_key")).get()?.value : false;

  const firstName = (session.user.name ?? session.user.email ?? "").split(/[\s@]/)[0];

  return (
    <div className="space-y-8">
      {/* Masthead — editorial, not a card */}
      <div className="rise border-b pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium tracking-widest text-muted-foreground">{todayLabel()}</p>
              <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Personal · Unlimited
              </span>
            </div>
            <h1 className="text-[30px] font-semibold leading-none tracking-tight md:text-[36px]">
              {greeting()}
              <span className="font-light text-muted-foreground">{firstName ? `, ${firstName}` : ""}</span>
            </h1>
            <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Your push notification command center. <span className="text-foreground">{(subsRow?.value ?? 0).toLocaleString()} active subscribers</span> across {domainsRow?.value ?? 0} domains.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/dashboard/domains"
              className="inline-flex h-9 items-center justify-center rounded-full border bg-card px-4 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
            >
              Add domain
            </Link>
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90 dark:bg-white dark:text-zinc-900"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              New campaign
            </Link>
          </div>
        </div>
      </div>

      {/* Primary metrics — bento: hero + 3 */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="rise lg:col-span-5">
          <div className="surface flex h-full flex-col rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <p className="kicker text-muted-foreground">Total subscribers</p>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden>
                  <path d={ICONS.users} />
                </svg>
              </span>
            </div>
            <p className="tabular mt-4 text-[42px] font-semibold leading-none tracking-tight">{(subsRow?.value ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-sm text-muted-foreground">Active across all domains · <Link href="/dashboard/analytics" className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">View analytics →</Link></p>
            <div className="mt-auto flex items-center gap-2 pt-6 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Live
              </span>
              <span>Updated just now</span>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-7 lg:grid-cols-3">
          <div className="rise rise-1">
            <StatCard label="Domains" value={(domainsRow?.value ?? 0).toLocaleString()} icon={<path d={ICONS.globe} />} tone="sky" href="/dashboard/domains" hint="VAPID per domain" />
          </div>
          <div className="rise rise-2">
            <StatCard label="Campaigns sent" value={(sentRow?.value ?? 0).toLocaleString()} icon={<path d={ICONS.send} />} tone="emerald" href="/dashboard/campaigns" />
          </div>
          <div className="rise rise-3">
            <StatCard label="Total clicks" value={(clicksRow?.value ?? 0).toLocaleString()} icon={<path d={ICONS.click} />} tone="amber" hint="All-time" />
          </div>
          <div className="sm:col-span-3">
            <div className="surface flex items-center justify-between rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <span className="hidden size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:inline-flex">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4" aria-hidden>
                    <path d={ICONS.shield} />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium">Infrastructure</p>
                  <p className="text-xs text-muted-foreground">SQLite WAL · 1M scale · Litestream optional</p>
                </div>
              </div>
              <Link href="/dashboard/status" className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">
                Status →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary — feature cards + live */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <h2 className="kicker text-muted-foreground">Services</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <QuickCard
              title="Backups"
              value={lastBackup ? `${lastBackup.kind}` : "No backups yet"}
              sub={lastBackup ? new Date(lastBackup.created_at).toLocaleDateString() : `Drive ${gdriveEnabled ? "on" : "off"} · VACUUM INTO`}
              href="/dashboard/settings"
              action="Manage"
              icon={<path d="M21 12a9 9 0 1 0-9-9 2.5 2.5 0 0 1 2.5 2.5V8a2 2 0 0 1 2 2v1a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2H9a4 4 0 0 1 0-8h1" />}
            />
            <QuickCard
              title="AI Studio"
              value={hasAiKey ? "Connected" : "Heuristic mode"}
              sub={hasAiKey ? "Model ready · hooks · translate" : "Add key for LLM features"}
              href="/dashboard/ai"
              action="Open"
              icon={<path d="M12 3l1.7 5.2L19 10l-5.3 1.8L12 17l-1.7-5.2L5 10l5.3-1.8zM19 14l1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1z" />}
            />
            <QuickCard
              title="Outbound webhooks"
              value="n8n / Zapier"
              sub="Subscribed · clicked · done"
              href="/dashboard/settings"
              action="Configure"
              icon={<path d="M10 13a5 5 0 0 0 7.5 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />}
            />
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="kicker text-muted-foreground">Live activity</h2>
            <Link href="/dashboard/analytics" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Analytics →
            </Link>
          </div>
          <div className="mt-3">
            <LiveFeed limit={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCard({
  title,
  value,
  sub,
  href,
  action,
  icon,
}: {
  title: string;
  value: string;
  sub: string;
  href: string;
  action: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="surface surface-hover group block rounded-2xl p-5">
      <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          {icon}
        </svg>
      </span>
      <p className="kicker mt-3 text-muted-foreground">{title}</p>
      <p className="mt-1.5 text-sm font-semibold leading-tight">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{sub}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
        {action} <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}
