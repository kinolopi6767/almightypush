import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lpLinks } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** The landing page reports a successful subscribe so the link can count it. */
export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const code = typeof body.code === "string" && body.code.length > 0 ? body.code : "";
  if (!code) return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });

  const [link] = await db.select({ id: lpLinks.id }).from(lpLinks).where(eq(lpLinks.code, code)).limit(1).all();
  if (!link) return NextResponse.json({ ok: false, error: "unknown link" }, { status: 404 });

  await db.update(lpLinks).set({ subscribers_count: sql`${lpLinks.subscribers_count} + 1` }).where(eq(lpLinks.id, link.id)).run();
  return NextResponse.json({ ok: true });
}