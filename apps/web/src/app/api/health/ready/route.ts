import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Readiness — DB reachable and migrations applied. */
export function GET() {
  try {
    const row = db.get<{ n: number }>(sql`SELECT 1 AS n`);
    const applied = row?.n === 1;
    return NextResponse.json({ ok: applied, db: "sqlite" }, { status: applied ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
}