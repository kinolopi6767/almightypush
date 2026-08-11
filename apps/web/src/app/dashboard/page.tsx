import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, domains, events, subscribers } from "@pushpanel/db/schema";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
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

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as {session.user.email} · workspace {session.user.workspaceId ?? "—"} · {session.user.role}
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

      <div className="mt-8 max-w-2xl">
        <LiveFeed />
      </div>
    </>
  );
}
