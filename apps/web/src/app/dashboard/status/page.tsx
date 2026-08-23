import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";
import { collectMetrics } from "@/lib/metrics";

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

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 break-all text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function StatusPage() {
  // In-process metrics + DB probe — no self-HTTP roundtrip, works even if
  // the public endpoints are locked down.
  const [metrics, dbReady] = await Promise.all([
    collectMetrics().catch(() => null),
    Promise.resolve().then(isDbReady),
  ]);

  if (!metrics) {
    return (
      <>
        <PageHeader
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

  return (
    <>
      <PageHeader title="Server status" description="Live process, queue and database health." />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Uptime" value={fmtUptime(metrics.uptimeSec)} sub={metrics.node} />
        <Card label="Load avg" value={metrics.load != null ? String(metrics.load) : "n/a"} sub={metrics.platform} />
        <Card
          label="Memory (heap)"
          value={fmtBytes(metrics.memory.heapUsed)}
          sub={`${fmtBytes(metrics.memory.rss)} rss / ${fmtBytes(metrics.memory.heapTotal)} total`}
        />
        <Card label="Database" value={fmtBytes(metrics.db.sizeBytes)} sub={metrics.db.path ?? "n/a"} />
        <Card
          label="Queue"
          value={String(metrics.queue.queued + metrics.queue.sending)}
          sub={`${metrics.queue.queued} queued · ${metrics.queue.sending} sending`}
        />
        <Card label="Failed deliveries" value={String(metrics.deliveriesFailed)} sub="all time" />
        <div className="rounded-xl border bg-card p-5 sm:col-span-2 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Database readiness</p>
          <p className="mt-2 text-2xl font-semibold">
            {dbReady ? (
              <span className="text-emerald-600 dark:text-emerald-400">ready</span>
            ) : (
              <span className="text-destructive">degraded</span>
            )}
          </p>
          <p className="mt-1 text-sm break-all text-muted-foreground">
            {metrics.lastAutomationError ? `Last automation error: ${metrics.lastAutomationError}` : "No automation errors."}
          </p>
        </div>
      </div>
    </>
  );
}