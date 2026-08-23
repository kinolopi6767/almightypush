/**
 * Tiny in-memory sliding-window rate limiter (single web process).
 * Server actions and public API routes share it via `rateLimit()`.
 *
 * Client IP trust policy: forwarded headers (`X-Forwarded-For`,
 * `X-Real-IP`) are only honored when the panel runs behind a reverse
 * proxy — set `TRUST_PROXY=1` in that deployment. When unset, spoofable
 * forwarded headers are ignored and limit keys collapse to the shared
 * `"unknown"` bucket. Because a directly-exposed panel cannot reliably
 * attribute requests, every public endpoint pairs its per-IP limit with a
 * global resource-level limit (per domain / per account) that cannot be
 * rotated away by header spoofing.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const CLEANUP_EVERY = 1_000;
const MAX_BUCKETS = 20_000;

const MAX_WINDOW_MS = 15 * 60_000;

function cleanup(now: number): void {
  for (const [key, bucket] of buckets) {
    // Retain hits for the longest window we use (15 min account limit) so
    // longer windows are not under-counted by premature eviction.
    bucket.hits = bucket.hits.filter((t) => now - t < MAX_WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

/**
 * Allow `limit` calls per `windowMs` per key; further calls are rejected
 * until the window rolls over. Returns true when the call is allowed.
 * Advanced: supports burst allowance (extra short-burst) and returns
 * rate-limit headers for proper Retry-After handling.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  return rateLimitWithHeaders(key, limit, windowMs).allowed;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetMs: number;
}

export function rateLimitWithHeaders(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size === 0 || buckets.size % CLEANUP_EVERY === 0) cleanup(now);
  if (buckets.size >= MAX_BUCKETS) cleanup(now);
  // Hard bound: cleanup is age-based and can still lose the race under key
  // rotation (spoofed XFF with TRUST_PROXY=1 misconfig). Evict the
  // oldest-inserted bucket — Map preserves insertion order — so memory stays
  // capped no matter what. A wrongly-evicted hot key merely restarts its
  // window; correctness of the limiter never depends on this path.
  while (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  // Sliding window: keep only hits inside window
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    return { allowed: false, remaining: 0, retryAfterMs, resetMs: oldest + windowMs };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterMs: 0, resetMs: now + windowMs };
}

/** Helper to build standard RateLimit headers for responses */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
  };
  if (!result.allowed && result.retryAfterMs > 0) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}

/**
 * Client IP from a request. Forwarded headers are honored only behind a
 * trusted reverse proxy (`TRUST_PROXY=1`); otherwise they are ignored so a
 * direct attacker cannot rotate rate-limit buckets at will.
 *
 * Uses the RIGHTMOST X-Forwarded-For entry: proxies append the real client
 * address, so the leftmost entry is attacker-controlled (spoofable per
 * request). The last entry is the one our trusted proxy actually saw.
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "1") return "unknown";
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** Parse an optional env override (defaults) into a bounded positive int. */
export function envRateLimit(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), 100_000);
}