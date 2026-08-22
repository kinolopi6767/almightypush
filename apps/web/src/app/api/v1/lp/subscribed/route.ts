import { corsJson, handlePublicOptions } from "@/lib/cors";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientIp, rateLimitWithHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { lpLinks } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** The landing page reports a successful subscribe so the link can count it. */
export async function POST(req: Request) {
  // The landing page is part of the panel itself — the report must come from
  // the panel's own origin (configurable via APP_URL; falls back to Host for
  // self-hosted deployments). Non-browser callers cannot forge a browser
  // Origin, and are bounded by the per-link rate window below.
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return corsJson({ ok: false, error: "origin required" }, { status: 403 });
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return corsJson({ ok: false, error: "origin not allowed" }, { status: 403 });
  }
  const allowed = [hostFromUrl(process.env.APP_URL), req.headers.get("host")?.split(":")[0]?.toLowerCase()].filter(Boolean) as string[];
  // Strict exact-match: subdomains are NOT allowed to report LP conversions.
  // If you serve the panel behind a subdomain proxy, set APP_URL to the
  // canonical host and ensure the landing page uses that same host.
  if (allowed.length === 0 || !allowed.some((h) => host === h)) {
    return corsJson({ ok: false, error: "origin not allowed" }, { status: 403 });
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return corsJson({ ok: false, error: "bad json" }, { status: 400 });
  }
  const code = typeof body.code === "string" && body.code.length > 0 ? body.code : "";
  if (!code) return corsJson({ ok: false, error: "code required" }, { status: 400 });

  const ip = clientIp(req.headers);
  const rlIp = rateLimitWithHeaders(`lp-subscribed:${ip}`, 60, 60_000);
  if (!rlIp.allowed) {
    return corsJson({ ok: false, error: "Too many reports" }, { status: 429, headers: rateLimitHeaders(rlIp, 60) });
  }
  const rlCode = rateLimitWithHeaders(`lp-subscribed:code:${code}`, 30, 60_000);
  if (!rlCode.allowed) {
    return corsJson({ ok: false, error: "Too many reports" }, { status: 429, headers: rateLimitHeaders(rlCode, 30) });
  }

  const [link] = db.select({ id: lpLinks.id }).from(lpLinks).where(eq(lpLinks.code, code)).limit(1).all();
  if (!link) return corsJson({ ok: false, error: "unknown link" }, { status: 404 });

  db.update(lpLinks)
    .set({ subscribers_count: sql`${lpLinks.subscribers_count} + 1` })
    .where(eq(lpLinks.id, link.id))
    .run();
  return corsJson({ ok: true });
}

function hostFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** CORS preflight for cross-origin SDK/API callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
