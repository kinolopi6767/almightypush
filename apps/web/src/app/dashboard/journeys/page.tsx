import { db } from "@/lib/db";
import { journeys } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function JourneysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : 0;
  const rows = wsId ? db.select().from(journeys).where(eq(journeys.workspace_id, wsId)).orderBy(desc(journeys.id)).all() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journeys</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visual canvas: trigger → filter → wait → push/email branches — OneSignal Journeys + Braze Canvas parity.</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No journeys yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create via API <code className="rounded bg-muted px-1 font-mono text-xs">POST /api/v1/journeys</code> or AI Studio. Worker checks <code className="rounded bg-muted px-1 font-mono text-xs">next_run_at</code> every 60s.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <div key={r.id} className="card-lift rounded-xl border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground break-words">
                    Trigger: <span className="font-mono text-xs">{r.trigger_type}</span> · Status: <span className={r.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{r.status}</span>
                    {r.next_run_at ? ` · next ${new Date(r.next_run_at).toLocaleString()}` : " · on demand"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{r.status}</span>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">View canvas JSON</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">{JSON.stringify(JSON.parse(r.canvas_json || "{}"), null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Canvas stored in <code className="rounded bg-muted px-1 font-mono text-xs">canvas_json {`{nodes, edges}`}</code> · AI Command Studio can auto-generate journeys.</p>
    </div>
  );
}
