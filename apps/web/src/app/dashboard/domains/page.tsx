import Link from "next/link";
import { count, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, subscribers } from "@pushpanel/db/schema";
import { DomainForm } from "./domain-form";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
  const rows = await db
    .select({ id: domains.id, name: domains.name, status: domains.status, provider: domains.provider, created_at: domains.created_at })
    .from(domains)
    .all();

  const counts = await db
    .select({ domain_id: subscribers.domain_id, value: count() })
    .from(subscribers)
    .where(isNull(subscribers.unsubscribed_at))
    .groupBy(subscribers.domain_id)
    .all();
  const countByDomain = new Map(counts.map((c) => [c.domain_id, c.value]));

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
              className="flex items-center justify-between rounded-xl border bg-card p-5 transition-colors hover:bg-accent/50"
            >
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {row.provider} · created {new Date(row.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{countByDomain.get(row.id) ?? 0} subscribers</span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {row.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <DomainForm />
      </div>
    </>
  );
}
