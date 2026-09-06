import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auditLog } from "@pushpanel/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Logs — Audit & System" };
export const dynamic = "force-dynamic";

function levelBadge(action: string) {
  if (action.includes("delete") || action.includes("revoke") || action.includes("failed")) {
    return "badge-danger";
  }
  if (action.includes("create") || action.includes("update") || action.includes("enabled")) {
    return "badge-ok";
  }
  if (action.includes("backup") || action.includes("settings")) {
    return "badge-info";
  }
  return "badge-neutral";
}

export default async function LogsPage({
 searchParams,
}: {
 searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
 const session = await auth();
 if (!session?.user) redirect("/login");
 const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
 if (!wsId) redirect("/setup");

 const params = await searchParams;
 const q = typeof params.q === "string" ? params.q.trim().slice(0, 64) : "";
 const filterAction = typeof params.action === "string" ? params.action.trim() : "";

  const conditions = [eq(auditLog.workspace_id, wsId)];
  if (q) {
    // Sanitize LIKE wildcards: escape % _ and \ then use ESCAPE '\' so the
    // backslash is honored (without ESCAPE, SQLite treats \ literally and
    // %/_ still act as wildcards).
    const sanitized = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push(sql`${auditLog.action} LIKE ${`%${sanitized}%`} ESCAPE '\'`);
  }
 if (filterAction) conditions.push(eq(auditLog.action, filterAction));

 const rows = db
  .select({
   id: auditLog.id,
   action: auditLog.action,
   entity_type: auditLog.entity_type,
   entity_id: auditLog.entity_id,
   meta_json: auditLog.meta_json,
   ts: auditLog.ts,
   user_id: auditLog.user_id,
  })
  .from(auditLog)
  .where(and(...conditions))
  .orderBy(desc(auditLog.ts), desc(auditLog.id))
  .limit(100)
  .all();

 const uniqueActions = [...new Set(rows.map((r) => r.action))].sort();

 return (
  <div className="space-y-6">
   <PageHeader eyebrow="System · Logs"
    title="Logs"
    description="Enterprise audit trail — every admin action, system event, and warning. Structured, searchable, exportable."
    actions={
     <a
      href="/api/export/audit"
      className="btn btn-secondary"
     >
      Export audit CSV
     </a>
    }
   />

   {/* Premium filter bar */}
   <form method="get" className="panel flex flex-wrap items-end gap-3 rounded-md p-4">
    <div className="flex flex-col gap-1.5 min-w-0 flex-1 max-w-xs">
     <label htmlFor="q" className="text-xs font-medium text-muted-foreground">Search action</label>
     <input
      id="q"
      name="q"
      defaultValue={q}
      placeholder="campaign.create, backup.delete…"
      className="input focus:border-primary/40 focus:ring-2 focus:ring-ring/30 outline-none"
     />
    </div>
    <div className="flex flex-col gap-1.5">
     <label htmlFor="action" className="text-xs font-medium text-muted-foreground">Action</label>
     <select
      id="action"
      name="action"
      defaultValue={filterAction}
      className="input"
     >
      <option value="">All actions</option>
      {uniqueActions.map((a) => (
       <option key={a} value={a}>{a}</option>
      ))}
     </select>
    </div>
    <button type="submit" className="btn btn-primary">
     Filter
    </button>
    {(q || filterAction) && (
     <a href="/dashboard/logs" className="btn btn-secondary">
      Clear
     </a>
    )}
   </form>

   {/* Premium log timeline */}
   <div className="panel overflow-hidden rounded-md">
    <div className="border-b bg-muted/20 px-5 py-3 flex items-center justify-between">
     <h2 className="text-sm font-semibold tracking-tight">Audit trail — last {rows.length} events</h2>
     <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success ring-1 ring-success/15">
      <span className="size-1.5 rounded-full bg-success livedot pulsing" aria-hidden /> Live audit
     </span>
    </div>

    {rows.length === 0 ? (
     <div className="p-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
      </div>
      <p className="mt-3 text-sm font-medium">No logs match your filter</p>
      <p className="mt-1 text-xs text-muted-foreground">Try a different search or clear filters.</p>
     </div>
    ) : (
     <div className="max-h-[600px] overflow-y-auto divide-y divide-border/60">
      {rows.map((r) => (
       <div key={r.id} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
        <span className={`badge shrink-0 ${levelBadge(r.action)}`}>
         {r.action}
        </span>
        {r.entity_type && (
         <span className="hidden md:inline-flex shrink-0 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground shadow-xs">
          {r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ""}
         </span>
        )}
        <div className="min-w-0 flex-1">
         {r.meta_json && (
          <p className="truncate text-xs text-muted-foreground font-mono">{r.meta_json.slice(0, 300)}</p>
         )}
        </div>
        <time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={r.ts}>
         {new Date(r.ts).toLocaleString()}
        </time>
       </div>
      ))}
     </div>
    )}

    <div className="border-t bg-muted/10 px-5 py-3 text-xs text-muted-foreground flex items-center justify-between">
     <span>Workspace #{wsId} · audit_log table · 100 latest</span>
     <span className="font-mono hidden sm:inline">Retention: unlimited · structured JSON</span>
    </div>
   </div>

   {/* Premium system guidance */}
   <div className="grid gap-4 sm:grid-cols-3">
    <div className="panel rounded-md p-5">
     <p className="micro-label">Log levels</p>
     <p className="mt-1 text-sm font-medium">Info · Warn · Error</p>
     <p className="mt-1 text-xs text-muted-foreground">All admin actions are info; warnings for rate limits; errors for failed jobs.</p>
    </div>
    <div className="panel rounded-md p-5">
     <p className="micro-label">Retention</p>
     <p className="mt-1 text-sm font-medium">Unlimited — SQLite</p>
     <p className="mt-1 text-xs text-muted-foreground">Prune via <code className="bg-muted px-1 rounded">DELETE FROM audit_log</code> if needed.</p>
    </div>
    <div className="panel rounded-md p-5">
     <p className="micro-label">Export</p>
     <p className="mt-1 text-sm font-medium">CSV · JSONL</p>
     <p className="mt-1 text-xs text-muted-foreground">Full export via <code className="bg-muted px-1 rounded">/api/export/*</code> endpoints.</p>
    </div>
   </div>
  </div>
 );
}
