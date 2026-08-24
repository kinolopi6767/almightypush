import { isIP } from "node:net";
import { promises as dns } from "node:dns";

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

/** True when the IP is in a non-public range (loopback, private, link-local, reserved). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
    if (a === 192 && b === 0) return true; // IETF protocol assignments incl. 192.0.0.9/10
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
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
