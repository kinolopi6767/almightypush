import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backups, campaigns, domains, events, settings, subscribers } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LiveFeed } from "@/components/live-feed";
import { StatCard } from "@/components/stat-card";

export const metadata = { title: "Dashboard" };

function greeting(timeZone?: string): string {
 let h = new Date().getHours();
 if (timeZone) {
  try {
   const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).formatToParts(new Date());
   const hh = Number(parts.find((p) => p.type === "hour")?.value);
   if (Number.isFinite(hh)) h = hh % 24;
  } catch {
   // unknown tz (legacy stored value) — fall back to server-local hour
  }
 }
 if (h < 5) return "Burning the midnight oil";
 if (h < 12) return "Good morning";
 if (h < 18) return "Good afternoon";
 return "Good evening";
}

function todayLabel(timeZone?: string): string {
 try {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...(timeZone ? { timeZone } : {}) });
 } catch {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
 }
}

const KIND_LABEL: Record<string, string> = {
 manual: "Manual snapshot",
 auto: "Auto snapshot",
 gdrive: "Drive snapshot",
};

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
 const panelTz = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "timezone")).get()?.value || undefined;

 const firstName = (session.user.name ?? session.user.email ?? "").split(/[\s@]/)[0];
 const subs = subsRow?.value ?? 0;
 const doms = domainsRow?.value ?? 0;

 return (
  <div className="space-y-6">
   {/* Console head — eyebrow + title + actions */}
   <div className="enter">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
     <div className="min-w-0 space-y-1.5">
      <p className="page-eyebrow">{todayLabel(panelTz)} · Overview</p>
      <h1 className="page-title text-[24px]">
       {greeting(panelTz)}
       <span className="font-normal text-[var(--ink-2)]">{firstName ? `, ${firstName}` : ""}</span>
      </h1>
      <p className="page-desc">
       <span className="tabular font-semibold text-[var(--ink)]">{subs.toLocaleString()} active subscribers</span> across {doms} domains.
      </p>
     </div>
     <div className="flex shrink-0 items-center gap-2">
      <Link href="/dashboard/domains" className="btn btn-secondary">
       Add domain
      </Link>
      <Link href="/dashboard/campaigns/new" className="btn btn-primary">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-3.5" aria-hidden>
        <path d="M12 5v14M5 12h14" />
       </svg>
       New send
      </Link>
     </div>
    </div>
    <hr aria-hidden className="divider mt-4" />
   </div>

   {/* KPI row — dense Stripe grid. testIds preserved for e2e. */}
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className="enter sm:col-span-2 xl:col-span-1" data-testid="stat-subscribers">
     <div className="kpi h-full">
      <div className="flex items-center justify-between gap-2">
       <p className="kpi-label">Subscribers</p>
       <span className="badge badge-ok"><span className="badge-dot livedot pulsing" aria-hidden />Live</span>
      </div>
      <p className="kpi-value tabular">{subs.toLocaleString()}</p>
            <div className="kpi-sub">
              Active across all domains ·{" "}
              <Link href="/dashboard/analytics" className="whitespace-nowrap font-medium text-[var(--brand)] underline underline-offset-4 hover:opacity-80">
                View analytics
              </Link>
            </div>
     </div>
    </div>
    <div className="enter enter-1">
     <StatCard label="Domains" value={doms.toLocaleString()} tone="info" href="/dashboard/domains" hint="VAPID per domain" />
    </div>
    <div className="enter enter-2">
     <StatCard label="Campaigns sent" value={(sentRow?.value ?? 0).toLocaleString()} tone="ok" href="/dashboard/campaigns" hint="Completed sends" />
    </div>
    <div className="enter enter-3">
     <StatCard label="Total clicks" value={(clicksRow?.value ?? 0).toLocaleString()} tone="warn" hint="All-time" />
    </div>
   </div>

   {/* Ops strip */}
   <div className="enter panel">
    <div className="panel-head">
     <p className="panel-title">Operations</p>
     <Link href="/dashboard/status" className="btn btn-ghost btn-sm">System health</Link>
    </div>
    <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--line)" }}>
     <OpsCell
      label="Backups"
      value={lastBackup ? KIND_LABEL[lastBackup.kind] ?? lastBackup.kind : "No backups yet"}
      sub={lastBackup ? new Date(lastBackup.created_at).toLocaleDateString() : `Drive ${gdriveEnabled ? "on" : "off"}`}
      href="/dashboard/settings"
      action="Manage"
     />
     <OpsCell
      label="AI Studio"
      value={hasAiKey ? "Connected" : "Heuristic mode"}
      sub={hasAiKey ? "Model ready" : "Add key for LLM features"}
      href="/dashboard/ai"
      action="Open"
     />
     <OpsCell
      label="Outbound webhooks"
      value="n8n / Zapier"
      sub="subscribed · clicked · done"
      href="/dashboard/settings"
      action="Configure"
     />
    </div>
   </div>

   {/* Live */}
   <div className="grid gap-4 lg:grid-cols-5">
    <div className="enter lg:col-span-3">
     <div className="panel">
      <div className="panel-head">
       <p className="panel-title">Sending pipeline</p>
       <Link href="/dashboard/campaigns" className="btn btn-ghost btn-sm">All campaigns</Link>
      </div>
      <div className="panel-body space-y-2 text-[13px] text-[var(--ink-2)]">
       <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--line)" }}>
        <span>Queue engine</span>
        <span className="badge badge-neutral">worker · 60s tick</span>
       </div>
       <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--line)" }}>
        <span>Storage</span>
        <span className="tabular font-mono text-[12px]">SQLite WAL · single-writer</span>
       </div>
       <div className="flex items-center justify-between">
        <span>Delivery</span>
        <span className="tabular font-mono text-[12px]">VAPID · TTL 86400</span>
       </div>
      </div>
     </div>
    </div>
    <div className="enter enter-1 lg:col-span-2">
     <LiveFeed limit={8} />
    </div>
   </div>
  </div>
 );
}

function OpsCell({ label, value, sub, href, action }: { label: string; value: string; sub: string; href: string; action: string }) {
 return (
  <Link href={href} className="group block p-4 transition-colors hover:bg-[var(--panel-2)]">
   <p className="micro-label">{label}</p>
   <p className="mt-1.5 text-[13.5px] font-semibold tracking-tight">{value}</p>
   <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">{sub}</p>
   <span className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--brand)]">
    {action} <span aria-hidden>→</span>
   </span>
  </Link>
 );
}
