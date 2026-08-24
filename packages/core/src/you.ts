/**
 * You.com API client — web grounding for AI Studio.
 *
 * Only the AI Studio (hooks, url-to-campaign research) uses this.
 * Worker's drip/cron/segments remain deterministic and never call it.
 *
 * Two modes:
 *  - YDC_API_KEY set: real you.com Search API (live web grounding)
 *  - not set: graceful no-op, callers fall back to heuristics/regex OG parsing
 */

export interface YouSearchResult {
  title?: string;
  url?: string;
  snippets?: string[];
  highlights?: string[];
}

export interface YouSearchResponse {
  hits?: YouSearchResult[];
  results?: YouSearchResult[];
}

export interface YouConfig {
  apiKey: string | null;
  baseUrl: string;
}

function resolveYouConfig(overrides?: Partial<YouConfig>): YouConfig {
  const apiKey = overrides?.apiKey ?? process.env.YDC_API_KEY ?? process.env.YOU_API_KEY ?? null;
  const baseUrl = overrides?.baseUrl ?? process.env.YDC_API_BASE_URL ?? "https://api.you.com";
  return { apiKey: apiKey || null, baseUrl: baseUrl.replace(/\/$/, "") };
}

/**
 * Live web grounding via you.com Search API.
 * Returns grounded snippets for a query — ideal to enrich hook generation
 * with trending context. Free tier: ?profile=free (search only, no key).
 */
export async function youSearch(
  query: string,
  opts?: { count?: number; freshness?: string; config?: Partial<YouConfig> },
): Promise<YouSearchResult[]> {
  const { apiKey, baseUrl } = resolveYouConfig(opts?.config);
  const count = Math.min(Math.max(opts?.count ?? 5, 1), 10);

  // Free tier fallback: unauthenticated search via MCP free profile
  const url = apiKey ? `${baseUrl}/v1/search` : `${baseUrl}/v1/search?profile=free`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const body: Record<string, unknown> = {
    query: query.slice(0, 400),
    num_results: count,
  };
  if (opts?.freshness) body.freshness = opts.freshness;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`you.com search ${res.status}`);
  const data = (await res.json()) as YouSearchResponse & { hits?: YouSearchResult[]; results?: YouSearchResult[] };
  // API returns hits or results depending on version
  const hits = (data.hits ?? data.results ?? []) as YouSearchResult[];
  return hits.slice(0, count);
}

/**
 * Deep research via you.com Research API.
 * Single-call agentic harness: plans, searches, cross-references, returns
 * cited answer or typed JSON. Use for url-to-campaign deep mode or
 * standalone research tool.
 */
export async function youResearch(
  query: string,
  opts?: {
    effort?: "lite" | "standard" | "deep" | "exhaustive";
    config?: Partial<YouConfig>;
  },
): Promise<{ answer: string; sources?: unknown[] }> {
  const { apiKey, baseUrl } = resolveYouConfig(opts?.config);
  if (!apiKey) throw new Error("YDC_API_KEY required for research");

  const res = await fetch(`${baseUrl}/v1/research`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({
      query: query.slice(0, 400),
      research_effort: opts?.effort ?? "standard",
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`you.com research ${res.status}`);
  const data = (await res.json()) as { answer?: string; sources?: unknown[]; result?: string };
  return { answer: data.answer ?? data.result ?? "", sources: data.sources };
}

export function isYouEnabled(config?: Partial<YouConfig>): boolean {
  return !!resolveYouConfig(config).apiKey;
}
