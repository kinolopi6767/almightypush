import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { domains } from "@pushpanel/db/schema";
import { automations } from "@pushpanel/db/schema";
import { AUTOMATION_TYPE_LABEL } from "@pushpanel/core";
import { AutomationForm } from "./automation-form";
import { AutomationRow } from "./row-actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
 const session = await auth();
 if (!session?.user) redirect("/login");
 const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
 if (!wsId) redirect("/setup");

 const [rows, domainRows] = await Promise.all([
  db
   .select({
    id: automations.id,
    name: automations.name,
    type: automations.type,
    status: automations.status,
    config_json: automations.config_json,
    last_run_at: automations.last_run_at,
    next_run_at: automations.next_run_at,
    error: automations.error,
    domain_id: automations.domain_id,
    domain_name: domains.name,
   })
   .from(automations)
   .leftJoin(domains, eq(domains.id, automations.domain_id))
   .where(eq(automations.workspace_id, wsId))
   .orderBy(desc(automations.id))
   .all(),
  db
   .select({ id: domains.id, name: domains.name })
   .from(domains)
   .where(eq(domains.workspace_id, wsId))
   .orderBy(domains.name)
   .all(),
 ]);

 return (
  <>
   <PageHeader eyebrow="Grow · Automations"
    title="Automations"
    description="Recurring pushes: welcome messages, publish webhooks, AutoMagic posts and YouTube uploads."
    actions={<AutomationForm domains={domainRows} />}
   />

   <div className="mt-8 space-y-3">
    {rows.length === 0 && (
     <EmptyState
      icon={<path d="M13 2 3 14h9l-1 8 10-12h-9z" />}
      title="No automations yet"
      description="Create one to push automatically — welcome messages, publish hooks, AutoMagic or drip sequences."
     />
    )}
    {rows.map((row) => (
     <div key={row.id} data-entity="automation" data-testid={`row-automation-${row.id}`} className=" rounded-md border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
       <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
         <span className="truncate font-medium">{row.name}</span>
         <span className="badge badge-neutral shrink-0">
          {AUTOMATION_TYPE_LABEL[row.type as keyof typeof AUTOMATION_TYPE_LABEL] ?? row.type}
         </span>
         <span className="badge badge-neutral max-w-[140px] shrink-0 truncate">{row.domain_name ?? "—"}</span>
         <span
          className={`badge shrink-0 ${
           row.status === "active" ? "badge-ok" : "badge-neutral"
          }`}
         >
          {row.status}
         </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
         <span>last {row.last_run_at ? new Date(row.last_run_at).toLocaleString() : "never"}</span>
         <span>·</span>
         <span>next {row.next_run_at ? new Date(row.next_run_at).toLocaleString() : "on demand"}</span>
         {row.error && <span className="break-all text-destructive">· {row.error.slice(0, 120)}</span>}
        </div>
        {row.type === "push_on_publish" && !parseSecret(row.config_json) && (
          <p className="form-warn mt-1.5">
          No webhook secret — recreate it so external publishers can trigger this automation.
         </p>
        )}
       </div>
       <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        <AutomationRow
         id={row.id}
         status={row.status}
         type={row.type}
         secret={
          row.type === "push_on_publish"
           ? parseSecret(row.config_json)
           : null
         }
        />
       </div>
      </div>
     </div>
    ))}
   </div>
  </>
 );
}

function parseSecret(configJson: string | null): string {
 try {
  return (JSON.parse(configJson ?? "{}") as { secret?: string }).secret ?? "";
 } catch {
  return "";
 }
}