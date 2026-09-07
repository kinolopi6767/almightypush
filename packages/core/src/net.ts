import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import { Agent } from "undici";

/**
 * SSRF guard for outbound fetches (automation source/feed URLs).
 * Rejects non-http(s), hostnames that resolve to private/loopback/link-local
 * addresses, and IP literals in those ranges. Disabled for local development
 * and tests via ALLOW_PRIVATE_UPSTREAM=1 (the worker must then be started
 * with that env set — e.g. Playwright does it for e2e mock feeds).
 */
export interface UrlCheckResult {
  ok: boolean;
  url: URL | null;
  error?: string;
}

export async function assertPublicHttpUrl(raw: string): Promise<UrlCheckResult> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, url: null, error: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, url, error: "Only http/https URLs are allowed" };
  }

  const allowPrivate = process.env.ALLOW_PRIVATE_UPSTREAM === "1";
  if (allowPrivate) return { ok: true, url };

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) !== 0) {
    if (isPrivateIp(hostname)) return { ok: false, url, error: "Private or reserved IPs are not allowed" };
    return { ok: true, url };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) return { ok: false, url, error: "Host resolves to a private address" };
    }
  } catch {
    return { ok: false, url, error: "DNS lookup failed" };
  }
  return { ok: true, url };
}

/**
 * Connect-time SSRF pinning. `assertPublicHttpUrl` validates a URL, but the
 * subsequent fetch performs a SECOND DNS resolution — an authoritative DNS
 * server can answer different addresses per query (DNS rebinding / TOCTOU),
 * so the pre-check alone is advisory. This dispatcher re-validates every
 * address at the moment the connection is actually established, closing the
 * gap: the socket can only ever open to an IP that passed the private-range
 * check. When ALLOW_PRIVATE_UPSTREAM=1 (dev/e2e) no validation is applied.
 */
let validatingAgent: Agent | null = null;
export function ssrfDispatcher(): Agent {
  if (validatingAgent) return validatingAgent;
  validatingAgent = new Agent({
    connect: {
      timeout: 10_000,
      lookup: (hostname, opts, cb) => {
        if (process.env.ALLOW_PRIVATE_UPSTREAM === "1") {
          dns.lookup(hostname, { ...opts, all: true }).then((addrs) => cb(null, addrs)).catch((err) => cb(err as Error, []));
          return;
        }
        dns
          .lookup(hostname, { ...opts, all: true })
          .then((addrs) => {
            for (const { address } of addrs) {
              if (isPrivateIp(address)) {
                cb(new Error(`Host resolves to a private address (${address})`), []);
                return;
              }
            }
            cb(null, addrs);
          })
          .catch((err) => cb(err as Error, []));
      },
    },
  });
  return validatingAgent;
}

/**
 * Hardened fetch for attacker-influenced URLs (feeds, source URLs, imports,
 * webhook targets): pre-validates the URL, then fetches with the
 * connect-time-validating dispatcher and manual redirects — each hop is
 * re-validated before it is followed (capped at `maxRedirects`).
 * `init.signal` and `init.headers`/`method`/`body` pass through. When the
 * caller provides no AbortSignal, a 10s default timeout applies so a hung
 * upstream can never stall the worker tick forever.
 */
const SSRF_DEFAULT_TIMEOUT_MS = 10_000;
export async function ssrfFetch(
  raw: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = { maxRedirects: 3 },
): Promise<Response> {
  const withTimeout: RequestInit =
    init.signal == null ? { ...init, signal: AbortSignal.timeout(SSRF_DEFAULT_TIMEOUT_MS) } : init;
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const check = await assertPublicHttpUrl(current);
    if (!check.ok || !check.url) throw new Error(check.error ?? "URL rejected by SSRF guard");
    const res = await fetch(check.url, { ...withTimeout, redirect: "manual", dispatcher: ssrfDispatcher() } as RequestInit);
    // Explicit redirect codes only: a bare 3xx range would treat 304 Not
    // Modified (no Location, never a redirect for our unconditional GETs) as
    // a redirect and throw a confusing error.
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      // Drain the body so the socket is released back to the pool.
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore drain errors */
      }
      if (!location) throw new Error(`Redirect ${res.status} without Location`);
      if (hop === (opts.maxRedirects ?? 3)) throw new Error("Too many redirects");
      current = new URL(location, check.url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

/** True when the IP is in a non-public range (loopback, private, link-local, reserved). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    const c = parts[2] ?? 0;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
    if (a === 192 && b === 0) return true; // IETF protocol assignments incl. 192.0.0.9/10
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // documentation TEST-NET-2 (198.51.100.0/24)
    if (a === 203 && b === 0 && c === 113) return true; // documentation TEST-NET-3 (203.0.113.0/24)
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    // Fully-expanded forms of loopback / unspecified.
    if (lower === "0:0:0:0:0:0:0:1" || lower === "0:0:0:0:0:0:0:0") return true;
    if (lower === "::" || lower === "::1") return true;
    // Explicit v6 ranges FIRST — a link-local like fe80::ffff:8.8.8.8 must be
    // classified by its fe80 prefix, not by its embedded (public) v4 tail.
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
    if (lower.startsWith("2001:db8")) return true; // documentation ::/32
    if (lower.startsWith("2001:10")) return true; // deprecated ORCHID 2001:10::/28
    if (lower.startsWith("2001:20")) return true; // ORCHIDv2 2001:20::/28
    if (lower.startsWith("2001:0:") || lower.startsWith("2001::")) return true; // Teredo 2001::/32 (v4 tunnel reach)
    if (lower.startsWith("2002:")) return true; // 6to4 2002::/16 (v4 tunnel reach)
    if (lower.startsWith("64:ff9b")) return true; // NAT64 well-known prefix
    if (lower.startsWith("100:")) return true; // discard-only 100::/64
    if (lower.startsWith("ff")) return true; // multicast ff00::/8 (link-local devices answer here)
    // IPv4-mapped (::ffff:192.168.1.1), IPv4 hex-mapped (::ffff:7f00:1) and
    // IPv4-embedded (::127.0.0.1) forms classify as their IPv4 counterpart.
    const v4form = extractEmbeddedV4(lower);
    if (v4form) return isPrivateIp(v4form);
    return false;
  }
  return false;
}

/** Extract an embedded IPv4 address from an IPv6 string, or null. */
function extractEmbeddedV4(lower: string): string | null {
  const dotted = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (dotted) return dotted[1]!;
  // Hex-encoded mapped form: ::ffff:7f00:1 or 0:0:0:0:0:ffff:7f00:1
  const hex = /^(?:[0-9a-f:]+):ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}
