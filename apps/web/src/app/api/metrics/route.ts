import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { resolveDbPath } from "@pushpanel/db";
import { deliveries, automations } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** Server metrics for the status page (public like /api/health). */
export async function GET() {
  const mem = process.memoryUsage();
  const load = (() => {
    try {
      // os.loadavg is not available on win32; process.loadavg doesn't exist.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require("node:os") as typeof import("node:os");
      const l = os.loadavg();
      return l[0] ?? null;
    } catch {
      return null;
    }
  })();

  let dbSizeBytes = 0;
  try {
    const dbFile = resolveDbPath(process.env.DATABASE_PATH);
    const s = await stat(dbFile);
    dbSizeBytes = s.size;
  } catch {
    // DB file not present in this process (e.g. in-memory)
  }

  const queue = db.get<{ queued: number; sending: number }>(
    sql`SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END) AS sending
    FROM deliveries`,
  );

  const failed = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM deliveries WHERE status = 'failed'`);
  const lastError = db
    .select({ error: automations.error, updated_at: automations.updated_at })
    .from(automations)
    .where(sql`${automations.error} IS NOT NULL`)
    .orderBy(automations.updated_at)
    .limit(1)
    .all();

  return NextResponse.json({
    ok: true,
    service: "pushpanel",
    version: "0.1.0",
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    load,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    db: {
      path: process.env.DATABASE_PATH ? resolveDbPath(process.env.DATABASE_PATH) : null,
      sizeBytes: dbSizeBytes,
    },
    queue: {
      queued: queue?.queued ?? 0,
      sending: queue?.sending ?? 0,
    },
    deliveriesFailed: failed?.n ?? 0,
    lastAutomationError: lastError[0]?.error ?? null,
  });
}