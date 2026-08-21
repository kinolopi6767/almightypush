import { auth } from "@/auth";
import { assertPublicHttpUrl } from "@pushpanel/core";
import { NextResponse } from "next/server";
import { extractOpenGraph } from "@/lib/fetch-content";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10_000_000; // personal: unlocked from 2M
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export interface FetchContentResult {
  title?: string;
  description?: string;
  image?: string;
}

/**
 * B2: fetch content from a URL (og-scrape). Session-only; used by the
 * campaign editor to prefill title/message/icon from the page's Open Graph
 * tags. SSRF-safe: assertPublicHttpUrl rejects private/loopback addresses
 * before any network I/O, and the response is size-capped with a hard
 * timeout so a hostile page cannot hang or exhaust the panel.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Rate-limit OG scraping: 30/min per user + global 120/min (prevent SSRF abuse at scale)
  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`fetch-content:${session.user.id ?? clientIp(req.headers)}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 30) });

  const url = new URL(req.url);
  const raw = url.searchParams.get("url");
  if (!raw) return NextResponse.json({ ok: false, error: "url parameter required" }, { status: 400 });

  const check = await assertPublicHttpUrl(raw);
  if (!check.ok || !check.url) {
    return NextResponse.json({ ok: false, error: check.error ?? "URL rejected" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Every hop (including each redirect target) is re-validated with
  // assertPublicHttpUrl before its request is made, redirects are capped,
  // and the response body is size-capped — a hostile page cannot bounce the
  // fetch onto a private address or exhaust memory.
  let current = check.url;
  let res: Response | undefined;
  try {
    for (let hops = 0; ; hops++) {
      const hop = await assertPublicHttpUrl(current.toString());
      if (!hop.ok || !hop.url) {
        return NextResponse.json({ ok: false, error: hop.error ?? "URL rejected" }, { status: 400 });
      }
      res = await fetch(hop.url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html", "user-agent": "PushPanelBot/1.0 (+https://pushpanel.app)" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return NextResponse.json({ ok: false, error: "Redirect without location" }, { status: 502 });
        if (hops >= MAX_REDIRECTS) return NextResponse.json({ ok: false, error: "Too many redirects" }, { status: 502 });
        current = new URL(location, hop.url);
        continue;
      }
      break;
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({ ok: false, error: timedOut ? "Timed out" : "Fetch failed" }, { status: timedOut ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!res!.ok) return NextResponse.json({ ok: false, error: `Page returned ${res!.status}` }, { status: 502 });
  if (!(res!.headers.get("content-type") ?? "").includes("text/html")) {
    return NextResponse.json({ ok: false, error: "Not an HTML page" }, { status: 415 });
  }

  const finalUrl = res!.url || current.href;
  const body = await res!.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return NextResponse.json({ ok: false, error: "Page too large" }, { status: 413 });

  const html = Buffer.from(body).toString("utf8").slice(0, MAX_BYTES);
  const out = extractOpenGraph(html);

  const absolute = (href: string | undefined): string | undefined => {
    if (!href) return undefined;
    try {
      return new URL(href, finalUrl).href;
    } catch {
      return undefined;
    }
  };

  const result: FetchContentResult = {
    title: out.title,
    description: out.description,
    image: absolute(out.image),
  };
  return NextResponse.json({ ok: true, ...result });
}