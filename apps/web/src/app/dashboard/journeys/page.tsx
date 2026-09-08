import { db } from "@/lib/db";
import { journeys } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { JourneyRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
 const session = await auth();
 if (!session?.user) redirect("/login");
 const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
 const rows = wsId ? db.select().from(journeys).where(eq(journeys.workspace_id, wsId)).orderBy(desc(journeys.id)).all() : [];

 return (
  <div className="space-y-6">
    <PageHeader eyebrow="Grow · Journeys"
     title="Journeys"
     description="Visual canvas: trigger → filter → wait → push/email branches — OneSignal Journeys + Braze Canvas parity."
    />
    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
      Preview: journey canvases are stored and scheduled, but step execution (push/email branches) is not enabled yet — active journeys are
      re-armed by the worker without sending anything. Journeys never send partially; this notice disappears once the runner lands.
    </p>
    {rows.length === 0 ? (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No journeys yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Create via <code className="rounded bg-muted px-1 font-mono text-xs">POST /api/v1/journeys</code> {`{name, trigger_type}`} or AI Studio. Worker checks <code className="rounded bg-muted px-1 font-mono text-xs">next_run_at</code> every tick.</p>
      </div>
    ) : (
    <div className="grid gap-3">
     {rows.map((r) => (
      <div key={r.id} className=" rounded-md border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
         <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground break-words">
           Trigger: <span className="font-mono text-xs">{r.trigger_type}</span> · Status: <span className={r.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{r.status}</span>
           {r.next_run_at ? ` · next ${new Date(r.next_run_at).toLocaleString()}` : " · on demand"}
          </p>
         </div>
         <JourneyRowActions id={r.id} status={r.status ?? "paused"} />
        </div>
       <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View canvas JSON</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">{(() => {
         try { return JSON.stringify(JSON.parse(r.canvas_json || "{}"), null, 2); }
         catch { return r.canvas_json; }
        })()}</pre>
       </details>
      </div>
     ))}
    </div>
   )}
   <p className="text-xs text-muted-foreground">Canvas stored in <code className="rounded bg-muted px-1 font-mono text-xs">canvas_json {`{nodes, edges}`}</code> · AI Command Studio can auto-generate journeys.</p>
  </div>
 );
}
