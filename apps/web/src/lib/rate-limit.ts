/**
 * Tiny in-memory sliding-window rate limiter (single web process).
 * Server actions and public API routes share it via `rateLimit()`.
 */

interface Bucket {
  hits: number[];
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
const CLEANUP_EVERY = 1_000;

function cleanup(now: number): void {
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 60_000);
    if (bucket.hits.length === 0 && now > bucket.blockedUntil) buckets.delete(key);
  }
}

/**
 * Allow `limit` calls per `windowMs` per key; further calls are rejected
 * until the window rolls over. Returns true when the call is allowed.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size % CLEANUP_EVERY === 0) cleanup(now);

  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (now < bucket.blockedUntil || bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

/** Client IP from a request — respects X-Forwarded-For from reverse proxies. */
export function clientIp(headers: Headers): string {
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