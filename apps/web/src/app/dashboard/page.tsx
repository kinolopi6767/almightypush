import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { backups, campaigns, domains, events, settings, subscribers } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LiveFeed } from "@/components/live-feed";

export const metadata = { title: "Dashboard" };

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

  const cards = [
    ["Subscribers", subsRow?.value ?? 0],
    ["Domains", domainsRow?.value ?? 0],
    ["Campaigns sent", sentRow?.value ?? 0],
    ["Clicks", clicksRow?.value ?? 0],
  ] as const;

  const [lastBackup] = wsId
    ? db.select({ created_at: backups.created_at, kind: backups.kind }).from(backups).orderBy(desc(backups.created_at)).limit(1).all()
    : [];
  const gdriveEnabled = wsId
    ? db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_enabled")).get()?.value === "1"
    : false;
  const hasAiKey = wsId ? !!db.select({ value: settings.value }).from(settings).where(eq(settings.key, "secret:ai_api_key")).get()?.value : false;

  return (
    <>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium">Personal Edition — All features unlocked</p>
        <p className="mt-1 text-xs text-muted-foreground">Private single-tenant • Unlimited domains/subscribers/campaigns • No pricing/plans • Data stays on your VPS • Backups: local + Google Drive (disabled by default)</p>
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as {session.user.email} · workspace {session.user.workspaceId ?? "—"} · {session.user.role} · <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">personal unlimited</span>
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <p className="kicker text-muted-foreground">{label}</p>
            <p className="tabular mt-2.5 text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Backups</p>
          <p className="mt-1 text-sm">{lastBackup ? `${lastBackup.kind} • ${new Date(lastBackup.created_at).toLocaleDateString()}` : "No backups yet"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Local VACUUM INTO + {gdriveEnabled ? "Drive ✓" : "Drive off"}</p>
          <Link href="/dashboard/settings" className="mt-2 inline-block text-xs text-primary hover:underline">Manage →</Link>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">AI Studio</p>
          <p className="mt-1 text-sm">{hasAiKey ? "API key set ✓" : "Heuristic fallback"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Hook / spam / translate / image</p>
          <Link href="/dashboard/ai" className="mt-2 inline-block text-xs text-primary hover:underline">Open →</Link>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Hosting</p>
          <p className="mt-1 text-sm">VPS / Coolify ready</p>
          <p className="mt-1 text-xs text-muted-foreground">SQLite WAL • 1M scale • Litestream optional</p>
          <Link href="/dashboard/guides" className="mt-2 inline-block text-xs text-primary hover:underline">Guides →</Link>
        </div>
      </div>

      <div className="mt-8 max-w-2xl">
        <LiveFeed />
      </div>
    </>
  );
}
