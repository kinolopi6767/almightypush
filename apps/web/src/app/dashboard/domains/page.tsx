import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains, subscribers } from "@pushpanel/db/schema";
import { DomainForm } from "./domain-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

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
      <PageHeader
        title="Domains"
        description="Each domain gets its own VAPID keypair and subscriber base."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {rows.length === 0 && (
            <EmptyState
              icon={
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              }
              title="No domains yet"
              description="Create your first domain to get a VAPID keypair and the integration snippet for your site. Any TLD works — .com, .online, .io…"
            />
          )}
          {rows.map((row, i) => (
            <Link
              key={row.id}
              href={`/dashboard/domains/${row.id}`}
              className={`card-lift rise${Math.min(i, 3) > 0 ? ` rise-${Math.min(i, 3)}` : ""} flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className="icon-chip size-9 shrink-0 rounded-lg text-xs font-bold uppercase">
                  {row.name.replace(/^www\./, "").slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {row.provider.toUpperCase()} · added {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
                  {(countByDomain.get(row.id) ?? 0).toLocaleString()} subscribers
                </span>
                {hasVapidKeys(row.provider_config_json) ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium capitalize text-emerald-600 dark:text-emerald-400">
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
