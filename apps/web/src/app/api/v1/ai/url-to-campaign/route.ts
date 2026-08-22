import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertPublicHttpUrl } from "@pushpanel/core";
import { extractOpenGraph } from "@/lib/fetch-content";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url() });

const MAX_BYTES = 10_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/**
 * AI Studio helper: scrape Open Graph data from a public URL.
 * SSRF-safe: every redirect hop is re-validated with assertPublicHttpUrl,
 * redirects are capped, the body is size-capped and the request is
 * time-boxed — a hostile page cannot bounce the fetch onto a private
 * address or exhaust memory (same discipline as /api/fetch-content).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const check = await assertPublicHttpUrl(parsed.data.url);
  if (!check.ok || !check.url) return NextResponse.json({ ok: false, error: check.error ?? "URL rejected" }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
        headers: { accept: "text/html", "user-agent": "PushPanelBot/1.0" },
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
    return NextResponse.json(
      { ok: false, error: timedOut ? "Timed out" : "Fetch failed" },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res!.ok) return NextResponse.json({ ok: false, error: `Page returned ${res!.status}` }, { status: 502 });
  if (!(res!.headers.get("content-type") ?? "").includes("text/html")) {
    return NextResponse.json({ ok: false, error: "Not an HTML page" }, { status: 415 });
  }

  const body = await res!.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return NextResponse.json({ ok: false, error: "Page too large" }, { status: 413 });

  const html = Buffer.from(body).toString("utf8").slice(0, MAX_BYTES);
  const og = extractOpenGraph(html);

  // Resolve og:image against the final URL after redirects.
  const finalUrl = res!.url || current.href;
  let image: string | undefined = og.image;
  if (image) {
    try {
      image = new URL(image, finalUrl).href;
    } catch {
      image = undefined;
    }
  }

  return NextResponse.json({ ok: true, title: og.title, description: og.description, image, url: finalUrl });
}
