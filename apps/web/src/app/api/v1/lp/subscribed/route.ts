import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { lpLinks } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** The landing page reports a successful subscribe so the link can count it. */
export async function POST(req: Request) {
  // The landing page is part of the panel itself — the report must come from
  // the panel's own origin (configurable via APP_URL; falls back to Host for
  // self-hosted deployments). Non-browser callers cannot forge a browser
  // Origin, and are bounded by the per-link rate window below.
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return NextResponse.json({ ok: false, error: "origin required" }, { status: 403 });
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, error: "origin not allowed" }, { status: 403 });
  }
  const allowed = [hostFromUrl(process.env.APP_URL), req.headers.get("host")?.split(":")[0]?.toLowerCase()].filter(Boolean) as string[];
  if (allowed.length === 0 || !allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
    return NextResponse.json({ ok: false, error: "origin not allowed" }, { status: 403 });
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const code = typeof body.code === "string" && body.code.length > 0 ? body.code : "";
  if (!code) return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });

  const ip = clientIp(req.headers);
  if (!rateLimit(`lp-subscribed:${ip}`, 60, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many reports" }, { status: 429 });
  }
  if (!rateLimit(`lp-subscribed:code:${code}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many reports" }, { status: 429 });
  }

  const [link] = await db.select({ id: lpLinks.id }).from(lpLinks).where(eq(lpLinks.code, code)).limit(1).all();
  if (!link) return NextResponse.json({ ok: false, error: "unknown link" }, { status: 404 });

  await db.update(lpLinks).set({ subscribers_count: sql`${lpLinks.subscribers_count} + 1` }).where(eq(lpLinks.id, link.id)).run();
  return NextResponse.json({ ok: true });
}

function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}