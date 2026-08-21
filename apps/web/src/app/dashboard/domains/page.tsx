import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains, subscribers } from "@pushpanel/db/schema";
import { DomainForm } from "./domain-form";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
  // Workspace-scoped: a panel user must never see another workspace's domains.
  const session = await auth();
  if (!session?.user) redirect("/login");
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) redirect("/setup");

  const rows = await db
    .select({
      id: domains.id,
      name: domains.name,
      status: domains.status,
      provider: domains.provider,
      created_at: domains.created_at,
      provider_config_json: domains.provider_config_json,
    })
    .from(domains)
    .where(eq(domains.workspace_id, workspaceId))
    .orderBy(domains.name)
    .all();

  const counts = await db
    .select({ domain_id: subscribers.domain_id, value: count() })
    .from(subscribers)
    .innerJoin(domains, eq(domains.id, subscribers.domain_id))
    .where(eq(domains.workspace_id, workspaceId))
    .groupBy(subscribers.domain_id)
    .all();
  const countByDomain = new Map(counts.map((c) => [c.domain_id, c.value]));

  /** A domain is send-ready only with a usable VAPID keypair. */
  const hasVapidKeys = (configJson: string | null): boolean => {
    try {
      const config = configJson ? JSON.parse(configJson) : null;
      return !!(config && config.publicKey && config.privateKeyEnc);
    } catch {
      return false;
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each domain gets its own VAPID keypair and subscriber base.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No domains yet — create your first one to get the integration snippet.
            </div>
          )}
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/dashboard/domains/${row.id}`}
              className="card-lift flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {row.provider} · created {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{(countByDomain.get(row.id) ?? 0).toLocaleString()} subscribers</span>
                {hasVapidKeys(row.provider_config_json) ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {row.status}
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                    title="Add VAPID keys to send pushes"
                  >
                    VAPID keys missing
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
        <DomainForm />
      </div>
    </>
  );
}
