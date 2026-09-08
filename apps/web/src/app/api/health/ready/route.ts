import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ReadyPayload {
  ok: boolean;
  db: string;
  migrations?: string;
  enc?: string;
  worker?: string;
  error?: string;
}

/**
 * Readiness — DB reachable AND schema present (migrations applied).
 * The old check (`SELECT 1`) reported ready on an empty/unmigrated file.
 * Also reports (non-fatally) whether the worker heartbeat is fresh, so a
 * panel with a dead background worker is visible to orchestrators.
 */
export function GET() {
  const payload: ReadyPayload = { ok: false, db: "sqlite" };
  try {
    const row = db.get<{ n: number }>(sql`SELECT 1 AS n`);
    if (row?.n !== 1) {
      return NextResponse.json({ ...payload, error: "not ready" }, { status: 503 });
    }
    // Migrations applied: core tables must exist.
    const schema = db.get<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('campaigns', 'subscribers', 'domains', 'deliveries', 'events', 'settings')`,
    );
    if ((schema?.n ?? 0) < 6) {
      return NextResponse.json({ ...payload, error: "migrations pending" }, { status: 503 });
    }
    payload.migrations = "ok";
    // Enc key present in production (fail-closed boot validates too; this
    // surfaces it to health consumers).
    if (process.env.NODE_ENV === "production" && !process.env.APP_ENC_KEY) {
      return NextResponse.json({ ...payload, error: "APP_ENC_KEY missing" }, { status: 503 });
    }
    payload.enc = "ok";
    // Worker liveness (advisory only — never blocks readiness; single-
    // process dev has no heartbeat file at all).
    try {
      const dbPath = process.env.DATABASE_PATH ?? "./data/pushpanel.db";
      const hb = `${dirname(dbPath)}/worker-heartbeat`;
      if (existsSync(hb)) {
        const ageSec = (Date.now() - statSync(hb).mtimeMs) / 1000;
        payload.worker = ageSec < 300 ? "ok" : "stale";
      } else {
        payload.worker = "unknown";
      }
    } catch {
      payload.worker = "unknown";
    }
    payload.ok = true;
    return NextResponse.json(payload, { status: 200 });
  } catch {
    // Public endpoint — never leak internal error details (stack traces,
    // file paths); operators check server logs for the actual cause.
    return NextResponse.json({ ...payload, error: "not ready" }, { status: 503 });
  }
}
