import { and, count, eq, isNull, sql } from "drizzle-orm";
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

  const [subsRow] = await db
    .select({ value: count() })
    .from(subscribers)
    .innerJoin(domains, eq(subscribers.domain_id, domains.id))
    .where(and(isNull(subscribers.unsubscribed_at), wsId ? eq(domains.workspace_id, wsId) : sql`1=1`));

  const [domainsRow] = await db.select({ value: count() }).from(domains).where(sql`1=1`);

  const [sentRow] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(and(eq(campaigns.status, "done"), wsId ? eq(campaigns.workspace_id, wsId) : sql`1=1`));

  const [clicksRow] = await db
    .select({ value: count() })
    .from(events)
    .where(eq(events.type, "clicked"));

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
          <div key={label} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 max-w-2xl">
        <LiveFeed />
      </div>
    </>
  );
}
