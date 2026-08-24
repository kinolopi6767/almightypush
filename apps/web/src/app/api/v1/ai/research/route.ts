import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { youResearch, youSearch } from "@pushpanel/core";
import { getYouConfig } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(2).max(400),
  effort: z.enum(["lite", "standard", "deep"]).default("standard"),
  mode: z.enum(["search", "research"]).default("search"),
});

/**
 * AI Studio: Web-grounded research via you.com
 * - mode=search: fast live snippets (5 results, <2s) — for hook grounding
 * - mode=research: agentic deep research with citations (lite/standard/deep)
 *
 * Requires YDC_API_KEY (or YOU_API_KEY) for search; falls back gracefully
 * to heuristic when not configured. Free credits cover ~16k lite calls.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.errors[0]?.message : "Invalid input";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const { apiKey: ydcKey } = getYouConfig();
  // search mode works on free tier (no key needed), research requires key
  if (!ydcKey && parsed.mode === "research") {
    return NextResponse.json(
      { ok: false, error: "Deep research requires YDC_API_KEY — set it in Settings → Secrets (search mode works on free tier)" },
      { status: 503 },
    );
  }

  const youConfig = ydcKey ? { apiKey: ydcKey } : undefined;
  try {
    if (parsed.mode === "research") {
      const { answer, sources } = await youResearch(parsed.query, { effort: parsed.effort, config: youConfig });
      return NextResponse.json({ ok: true, mode: "research", answer, sources, effort: parsed.effort });
    } else {
      const hits = await youSearch(parsed.query, { count: 5, config: youConfig });
      return NextResponse.json({ ok: true, mode: "search", hits });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
