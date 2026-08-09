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

  const hostname = url.hostname;
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

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe8")) return true;
    if (lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
    return false;
  }
  return false;
}
