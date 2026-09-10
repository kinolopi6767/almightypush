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
import { ssrfFetch } from "./net.js";

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

/** Cap on you.com response bodies — res.json() would buffer unbounded input. */
const MAX_RESPONSE_BYTES = 1_000_000;
/** you.com Search freshness values — anything else is dropped, not forwarded. */
const FRESHNESS_ALLOWLIST = new Set(["day", "week", "month", "year"]);

/**
 * Read a JSON response with a hard byte cap. `res.json()` buffers the entire
 * body before parsing — a compromised/hijacked upstream could stream
 * gigabytes and OOM the panel. Anything past the cap aborts the read.
 * Exported for unit tests (pure I/O on a Response object).
 */
export async function readCappedJson<T>(res: Response): Promise<T> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("you.com: empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error("you.com: response too large");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("you.com: invalid response");
  }
}

function resolveYouConfig(overrides?: Partial<YouConfig>): YouConfig {
  const apiKey = overrides?.apiKey ?? process.env.YDC_API_KEY ?? process.env.YOU_API_KEY ?? null;
  const baseUrl = (overrides?.baseUrl ?? process.env.YDC_API_BASE_URL ?? "https://api.you.com").replace(/\/+$/, "");
  // A key must never cross a plaintext network hop to a non-loopback host.
  if (apiKey) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error("you.com base URL is invalid");
    }
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
    if (url.protocol !== "https:" && !loopback) {
      throw new Error("you.com base URL must be https when an API key is configured");
    }
  }
  return { apiKey: apiKey || null, baseUrl };
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
  // Freshness is operator-influenced input — forward only known values so a
  // typo or injection never reaches the upstream API.
  if (opts?.freshness && FRESHNESS_ALLOWLIST.has(opts.freshness)) body.freshness = opts.freshness;

  // SSRF-hardened transport: the base URL comes from operator env
  // (YDC_API_BASE_URL) and the API key is sent to it — a misconfigured or
  // malicious override pointing at an internal host would otherwise exfiltrate
  // the key. ssrfFetch pre-validates the host, pins the connection-time IP,
  // re-validates every redirect hop, and bounds the whole call at 10s.
  // (ALLOW_PRIVATE_UPSTREAM=1 keeps dev/e2e localhost mocks working.)
  const res = await ssrfFetch(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    },
    { maxRedirects: 0 },
  );
  if (!res.ok) throw new Error(`you.com search ${res.status}`);
  const data = (await readCappedJson<YouSearchResponse & { hits?: YouSearchResult[]; results?: YouSearchResult[] }>(res)) as YouSearchResponse & {
    hits?: YouSearchResult[];
    results?: YouSearchResult[];
  };
  // API returns hits or results depending on version. Malformed shapes must
  // not throw a TypeError out of sanitize (the caller would turn a
  // recoverable upstream glitch into a hard 502).
  const hits = Array.isArray(data.hits) ? data.hits : Array.isArray(data.results) ? data.results : [];
  return sanitizeYouHits(hits, count);
}

/**
 * Bound each hit: a compromised upstream must not push megabytes of snippet
 * text through the panel response into the browser. Pure — unit tested.
 */
export function sanitizeYouHits(hits: YouSearchResult[], count: number): YouSearchResult[] {
  const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);
  const strList = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((s) => typeof s === "string").map((s) => (s as string).slice(0, 1000)).slice(0, 5) : undefined;
  // Only http(s) links may flow to the UI/LLM — a `javascript:`/`data:` URL
  // from a compromised upstream must never become referenceable.
  const safeUrl = (v: unknown): string | undefined => {
    const raw = str(v, 2048);
    if (!raw) return undefined;
    try {
      const parsed = new URL(raw);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : undefined;
    } catch {
      return undefined;
    }
  };
  if (!Array.isArray(hits)) return [];
  return hits
    .filter((h): h is YouSearchResult => Boolean(h) && typeof h === "object")
    .slice(0, Math.max(0, count))
    .map((h) => ({
      title: str(h.title, 300),
      url: safeUrl(h.url),
      snippets: strList(h.snippets),
      highlights: strList(h.highlights),
    }));
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

  // Same hardened transport as youSearch (SSRF guard + capped response) —
  // the research call carries the API key and runs up to 30s.
  const res = await ssrfFetch(
    `${baseUrl}/v1/research`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        query: query.slice(0, 400),
        research_effort: opts?.effort ?? "standard",
      }),
      signal: AbortSignal.timeout(30000),
    },
    { maxRedirects: 0 },
  );
  if (!res.ok) throw new Error(`you.com research ${res.status}`);
  const data = await readCappedJson<{ answer?: string; sources?: unknown[]; result?: string }>(res);
  // Bound the surfaced payload: answer text + a small source sample. A
  // compromised upstream returning megabytes of "sources" must not flow
  // unbounded into the panel response / DB-backed audit rows.
  const answer = (data.answer ?? data.result ?? "").slice(0, 20_000);
  const sources = Array.isArray(data.sources) ? data.sources.slice(0, 20) : undefined;
  return { answer, sources };
}
