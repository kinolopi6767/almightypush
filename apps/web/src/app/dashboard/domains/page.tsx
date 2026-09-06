import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains, subscribers } from "@pushpanel/db/schema";
import { DomainForm } from "./domain-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
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
  .where(and(eq(domains.workspace_id, workspaceId), isNull(subscribers.unsubscribed_at)))
  .groupBy(subscribers.domain_id)
  .all();
 const countByDomain = new Map(counts.map((c) => [c.domain_id, c.value]));

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
    eyebrow="Operate · Domains"
    title="Domains"
    description="Each domain gets its own VAPID keypair and subscriber base."
   />

   <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
    <div className="space-y-2.5">
     {rows.length === 0 && (
      <EmptyState
       icon={
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
       }
       title="No domains yet"
       description="Create your first domain to get a VAPID keypair and the integration snippet for your site. Any TLD works — .com, .online, .io…"
      />
     )}
     {rows.length > 0 && (
      <div className="table-wrap">
       <table className="console-table">
        <thead>
         <tr>
          <th>Domain</th>
          <th>Provider</th>
          <th className="num">Subscribers</th>
          <th>Status</th>
         </tr>
        </thead>
        <tbody>
         {rows.map((row) => (
          <tr key={row.id} data-testid={`row-domain-${row.id}`} data-entity="domain">
           <td>
            <Link href={`/dashboard/domains/${row.id}`} className="flex items-center gap-2.5 font-medium hover:text-[var(--brand)]">
             <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--brand-wash)] font-mono text-[10px] font-bold uppercase text-[var(--brand)]">
              {row.name.replace(/^www\./, "").slice(0, 2)}
             </span>
             <span className="min-w-0">
              <span className="block truncate">{row.name}</span>
              <span className="block text-[12px] font-normal text-[var(--ink-3)]">added {new Date(row.created_at).toLocaleDateString()}</span>
             </span>
            </Link>
           </td>
           <td className="tabular font-mono text-[12px] text-[var(--ink-2)]">{row.provider.toUpperCase()}</td>
           <td className="num tabular">{(countByDomain.get(row.id) ?? 0).toLocaleString()}</td>
           <td>
            {hasVapidKeys(row.provider_config_json) ? (
             <span className="badge badge-ok"><span className="badge-dot" aria-hidden />{row.status}</span>
            ) : (
             <span className="badge badge-warn" title="Add VAPID keys to send pushes"><span className="badge-dot" aria-hidden />Keys missing</span>
            )}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     )}
    </div>
    <DomainForm />
   </div>
  </>
 );
}
