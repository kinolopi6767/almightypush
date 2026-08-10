import { headers } from "next/headers";

export const metadata = { title: "Server status" };

interface Metrics {
  ok: boolean;
  uptimeSec: number;
  time: string;
  node: string;
  platform: string;
  load: number | null;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  db: { path: string | null; sizeBytes: number };
  queue: { queued: number; sending: number };
  deliveriesFailed: number;
  lastAutomationError: string | null;
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
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function StatusPage() {
  const host = (await headers()).get("host") ?? "localhost:3100";
  const proto = process.env.NODE_ENV === "production" && !host.startsWith("127.0.0.1") ? "https" : "http";
  const res = await fetch(`${proto}://${host}/api/metrics`, { cache: "no-store" }).catch(() => null);
  const metrics: Metrics | null = res?.ok ? ((await res.json()) as Metrics) : null;

  const readiness = await fetch(`${proto}://${host}/api/health/ready`, { cache: "no-store" }).catch(() => null);

  if (!metrics) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Server status</h1>
        <p className="mt-1 text-sm text-muted-foreground">Metrics endpoint unreachable.</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Server status</h1>
      <p className="mt-1 text-sm text-muted-foreground">Live process, queue and database health.</p>

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
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Worker readiness</p>
          <p className="mt-2 text-2xl font-semibold">
            {readiness?.ok ? (
              <span className="text-emerald-500">ready</span>
            ) : (
              <span className="text-destructive">degraded</span>
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {metrics.lastAutomationError ? `Last automation error: ${metrics.lastAutomationError}` : "No automation errors."}
          </p>
        </div>
      </div>
    </>
  );
}