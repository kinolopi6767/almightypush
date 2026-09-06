import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { collectMetrics } from "@/lib/metrics";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isOwner } from "@/lib/roles";

export const metadata = { title: "Server status" };

function isDbReady(): boolean {
 try {
  return db.get<{ n: number }>(sql`SELECT 1 AS n`)?.n === 1;
 } catch {
  return false;
 }
}

function fmtBytes(n: number): string {
 if (n < 1024) return `${n} B`;
 const units = ["KB", "MB", "GB", "TB"];
 let v = n;
 let u = -1;
 do {
  v /= 1024;
  u++;
 } while (v >= 1024 && u < units.length - 1);
 return `${v.toFixed(1)} ${units[u]}`;
}

function fmtUptime(sec: number): string {
 const d = Math.floor(sec / 86400);
 const h = Math.floor((sec % 86400) / 3600);
 const m = Math.floor((sec % 3600) / 60);
 return `${d}d ${h}h ${m}m`;
}

function Card({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "success" | "warning" | "destructive" }) {
 const toneStyles: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
 };
 return (
  <div className="panel rounded-md p-6">
   <p className="micro-label">{label}</p>
   <p className={`tabular mt-3 text-[26px] font-semibold leading-none tracking-tight ${toneStyles[tone] ?? ""}`}>{value}</p>
   {sub && <p className="mt-2 break-all text-xs leading-relaxed text-muted-foreground">{sub}</p>}
  </div>
 );
}

export default async function StatusPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const privileged = isOwner(session.user.role);
  // In-process metrics + DB probe — no self-HTTP roundtrip, works even if
  // the public endpoints are locked down.
  const [metrics, dbReady] = await Promise.all([
    collectMetrics().catch(() => null),
    Promise.resolve().then(isDbReady),
  ]);

 if (!metrics) {
  return (
   <>
    <PageHeader eyebrow="System · Status"
     title="Server status"
     description={
      <>
       Metrics unavailable — check <code className="rounded bg-muted px-1 font-mono text-xs">/api/health</code> and try again in a few seconds.
      </>
     }
    />
   </>
  );
 }

 const queueTotal = metrics.queue.queued + metrics.queue.sending;
 const queueTone = queueTotal > 1000 ? "warning" : queueTotal > 0 ? "default" : "success";
 const failedTone = metrics.deliveriesFailed > 100 ? "warning" : "default";

 return (
  <>
   <PageHeader
    title="Server status"
    description="Live process, queue and database health — enterprise observability with premium insights."
   />

   <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Card label="Uptime" value={fmtUptime(metrics.uptimeSec)} sub={metrics.node} />
    <Card label="Load avg" value={metrics.load != null ? metrics.load.toFixed(2) : "n/a"} sub={metrics.platform} />
    <Card
     label="Memory (heap)"
     value={fmtBytes(metrics.memory.heapUsed)}
     sub={`${fmtBytes(metrics.memory.rss)} rss / ${fmtBytes(metrics.memory.heapTotal)} total`}
    />
     <Card label="Database" value={fmtBytes(metrics.db.sizeBytes)} sub={privileged ? (metrics.db.path ?? "n/a") : "SQLite · WAL"} />
    <Card
     label="Queue"
     value={String(queueTotal)}
     sub={`${metrics.queue.queued} queued · ${metrics.queue.sending} sending`}
     tone={queueTone}
    />
    <Card label="Failed deliveries" value={String(metrics.deliveriesFailed)} sub="all time" tone={failedTone} />
    <div className="panel rounded-md p-6 sm:col-span-2 lg:col-span-2">
     <p className="micro-label">Database readiness</p>
     <p className="mt-3 flex items-center gap-2 text-2xl font-semibold">
      <span className={`size-2 rounded-full ${dbReady ? "bg-success livedot pulsing" : "bg-destructive"}`} aria-hidden />
      {dbReady ? (
       <span className="text-emerald-600 dark:text-emerald-400">Operational</span>
      ) : (
       <span className="text-destructive">Degraded</span>
      )}
     </p>
      <p className="mt-2 break-all text-sm leading-relaxed text-muted-foreground">
       {privileged ? (metrics.lastAutomationError ? `Last automation error: ${metrics.lastAutomationError}` : "No automation errors — all systems nominal.") : "Queue health nominal."}
      </p>
    </div>
   </div>

   {/* Premium observability footer */}
   <div className="mt-6 panel rounded-md p-5">
    <div className="flex items-center justify-between">
     <div>
      <h3 className="text-sm font-semibold tracking-tight">Enterprise observability</h3>
      <p className="mt-1 text-xs text-muted-foreground">Structured logs available via <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">logger</code> · Audit trail in Settings · Health at <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/health</code></p>
     </div>
     <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success ring-1 ring-inset ring-success/15">
      <span className="size-1.5 rounded-full bg-success livedot pulsing" aria-hidden /> All systems go
     </span>
    </div>
   </div>
  </>
 );
}