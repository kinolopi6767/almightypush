/**
 * Origin enforcement shared by the public subscribe-family endpoints.
 *
 * - When the browser sends an `Origin` header (all cross-origin POSTs do),
 *   it is the strongest signal: the subscribing page must live on the
 *   domain's own host (or a subdomain) or on the panel's own host (the
 *   built-in sandbox demo / self-hosted sites). A site on any other origin
 *   cannot forge this from a browser.
 * - When `Origin` is absent (older clients, non-browser callers), the caller
 *   may opt into `requireOrigin` to fail closed instead of trusting the
 *   client-supplied `subscribeUrl` (which such callers can always fabricate).
 *   State-mutating SDK endpoints that require a secret capability
 *   (subscribe/resubscribe/unsubscribe/tags carry the push endpoint token)
 *   may keep the fallback; telemetry endpoints that mutate only counters
 *   (optin) must require Origin.
 */
export function requestOriginAllowed(
  req: Request,
  subscribeUrl: string,
  domainName: string,
  opts: { requireOrigin?: boolean } = {},
): boolean {
  const name = domainName.toLowerCase().replace(/^\./, "");
  const appUrlHost = appUrlHostname();
  const host = parseHostHeader(req.headers.get("host"));

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      // The request Host vouches ONLY for non-routable addresses (loopback /
      // RFC1918 / link-local: same-machine sandbox, LAN-IP testing). A public
      // hostname DNS-pointed at the panel must never satisfy this check for
      // someone else's domain. Internal-hostname deployments must set APP_URL
      // to match (already a documented requirement).
      const localHost = host && isNonRoutableHost(host) ? host : null;
      for (const allowed of [name, appUrlHost, localHost]) {
        if (allowed && (originHost === allowed || originHost.endsWith(`.${allowed}`))) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // No Origin (non-browser / legacy callers): the request Host is fully
  // attacker-controlled, so only the domain name and APP_URL may vouch.
  if (opts.requireOrigin) return false;
  if (!subscribeUrl) return false;
  try {
    const hostname = new URL(subscribeUrl).hostname.toLowerCase();
    for (const allowed of [name, appUrlHost]) {
      if (allowed && (hostname === allowed || hostname.endsWith(`.${allowed}`))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Host header → bare lowercase hostname (strips port AND IPv6 brackets).
 * A naive split(':')[0] turns '[::1]:3000' into '[' — breaking the
 * same-machine sandbox allowance for IPv6-literal Hosts. */
export function parseHostHeader(host: string | null): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    if (end === -1) return null;
    return h.slice(1, end) || null;
  }
  const colon = h.lastIndexOf(":");
  // A second colon means a bare (bracketless) IPv6 literal — no port present.
  if (colon !== h.indexOf(":")) return h;
  return (colon === -1 ? h : h.slice(0, colon)) || null;
}

/** Non-routable Host values (loopback / RFC1918 / link-local / localhost). */
export function isNonRoutableHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost") return true;
  if (h === "::1" || h === "::ffff:127.0.0.1") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (h.includes(":")) {
    // IPv6 unique-local (fc00::/7) and link-local (fe80::/10 = fe80-febf).
    // A bare startsWith('fe80:') misses fe90-febf — match the /10 prefix bits.
    return h.startsWith("fc") || h.startsWith("fd") || /^fe[89ab]/.test(h);
  }
  // Non-IP hostnames (incl. *.local): routable until proven otherwise.
  return h.endsWith(".localhost");
}

/** APP_URL origin hostname, when the deployer fixed the panel's public URL. */
export function appUrlHostname(): string | null {
  const url = process.env.APP_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
