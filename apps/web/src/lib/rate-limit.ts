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
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size === 0 || buckets.size % CLEANUP_EVERY === 0) cleanup(now);
  if (buckets.size >= MAX_BUCKETS) cleanup(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

/**
 * Client IP from a request. Forwarded headers are honored only behind a
 * trusted reverse proxy (`TRUST_PROXY=1`); otherwise they are ignored so a
 * direct attacker cannot rotate rate-limit buckets at will.
 */
export function clientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "1") return "unknown";
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
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