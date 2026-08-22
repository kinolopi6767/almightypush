import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backups, campaigns, domains, events, settings, subscribers } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LiveFeed } from "@/components/live-feed";
import { StatCard } from "@/components/stat-card";

export const metadata = { title: "Dashboard" };

/* 24×24 stroke icon paths */
const ICONS = {
  users:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  click: "M9 9l5 12 1.8-5.2L21 14zM7.2 2.2 8 5.1M5.1 8 2.2 7.2M14 4.1 12 6M6 12l-1.9 2",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
    <>
      {/* Hero */}
      <div className="rise surface relative overflow-hidden rounded-2xl p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(560px 200px at 12% -20%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%), radial-gradient(420px 180px at 96% 120%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[1.35rem] font-semibold tracking-tight">
                {greeting()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground backdrop-blur">
                Personal · Unlimited
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your domains.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/domains"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden>
                <path d="M5 12h14M12 5v14" />
              </svg>
              Add domain
            </Link>
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition-all hover:bg-primary-hover active:scale-[0.98]"
            >
              New campaign
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rise">
          <StatCard
            label="Subscribers"
            value={(subsRow?.value ?? 0).toLocaleString()}
            icon={<path d={ICONS.users} />}
            tone="primary"
            hint="Active across all domains"
          />
        </div>
        <div className="rise rise-1">
          <StatCard
            label="Domains"
            value={(domainsRow?.value ?? 0).toLocaleString()}
            icon={<path d={ICONS.globe} />}
            tone="sky"
            href="/dashboard/domains"
          />
        </div>
        <div className="rise rise-2">
          <StatCard
            label="Campaigns sent"
            value={(sentRow?.value ?? 0).toLocaleString()}
            icon={<path d={ICONS.send} />}
            tone="emerald"
            href="/dashboard/campaigns"
          />
        </div>
        <div className="rise rise-3">
          <StatCard
            label="Clicks"
            value={(clicksRow?.value ?? 0).toLocaleString()}
            icon={<path d={ICONS.click} />}
            tone="amber"
            hint="All-time link clicks"
          />
        </div>
      </div>

      {/* Quick cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <QuickCard
          title="Backups"
          value={lastBackup ? `${lastBackup.kind} · ${new Date(lastBackup.created_at).toLocaleDateString()}` : "No backups yet"}
          sub={`Local VACUUM INTO + Drive ${gdriveEnabled ? "on" : "off"}`}
          href="/dashboard/settings"
          linkLabel="Manage"
          icon={
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8M21 3v5h-5" />
          }
        />
        <QuickCard
          title="AI Studio"
          value={hasAiKey ? "API key connected" : "Heuristic fallback"}
          sub="Hooks · spam check · translate · images"
          href="/dashboard/ai"
          linkLabel="Open"
          icon={
            <path d="M12 3l1.9 5.8L19.7 10l-5.8 1.9L12 17.7l-1.9-5.8L4.3 10l5.8-1.2zM19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" />
          }
        />
        <QuickCard
          title="Hosting"
          value="VPS / Coolify ready"
          sub="SQLite WAL · 1M scale · Litestream optional"
          href="/dashboard/guides"
          linkLabel="Guides"
          icon={<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />}
        />
      </div>

      {/* Live feed */}
      <div className="mt-6 rise rise-2">
        <LiveFeed limit={20} />
      </div>
    </>
  );
}

function QuickCard({
  title,
  value,
  sub,
  href,
  linkLabel,
  icon,
}: {
  title: string;
  value: string;
  sub: string;
  href: string;
  linkLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-lift rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="icon-chip size-7 shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
            {icon}
          </svg>
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</p>
      </div>
      <p className="mt-2.5 text-sm font-medium">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      <Link href={href} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}
