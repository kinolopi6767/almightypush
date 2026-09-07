/**
 * Same-origin guard for session-authenticated (cookie) POST routes.
 *
 * Session cookies rely on SameSite=Lax, which blocks top-level cross-site
 * GETs but does not cover all CSRF vectors (e.g. same-site-subdomain
 * attackers, Lax-allowlisted top-level POST navigations in some browsers).
 * This is defense-in-depth: when the browser sends Origin/Referer, it must
 * match the panel's own APP_URL host. Non-browser callers send neither and
 * are allowed through (auth still enforced) — these routes are panel-only,
 * key-authed server-to-server routes never call this.
 */
export function isSameOriginRequest(req: Request): boolean {
  const appUrl = process.env.APP_URL;
  let appHost: string | null = null;
  if (appUrl) {
    try {
      appHost = new URL(appUrl).hostname.toLowerCase();
    } catch {
      appHost = null;
    }
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (appHost) return host === appHost || host.endsWith(`.${appHost}`);
      // APP_URL unset (dev): fall back to the request Host.
      const reqHost = req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
      return host === reqHost;
    } catch {
      return false;
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (appHost) return host === appHost || host.endsWith(`.${appHost}`);
      const reqHost = req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
      return host === reqHost;
    } catch {
      return false;
    }
  }
  // No Origin/Referer (curl, server-to-server, older clients): allow — the
  // session cookie check that follows is still authoritative.
  return true;
}
