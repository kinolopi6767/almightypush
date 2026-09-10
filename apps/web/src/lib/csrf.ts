/**
 * Same-origin guard for session-authenticated (cookie) POST routes.
 *
 * Session cookies rely on SameSite=Lax, which blocks top-level cross-site
 * GETs but does not cover all CSRF vectors (e.g. same-site-subdomain
 * attackers, Lax-allowlisted top-level POST navigations in some browsers).
 * This is defense-in-depth: when the browser sends Origin/Referer, it must
 * match the panel's own APP_URL origin exactly (scheme + host + port).
 *
 * The previous hostname-suffix check (`host === appHost || host.endsWith("." + appHost)`)
 * accepted ANY subdomain of APP_URL — an attacker with a user-content
 * subdomain (evil.example.com when APP_URL=example.com) is same-site under
 * SameSite=Lax and would have passed. Scheme/port were also ignored.
 *
 * Non-browser callers (curl, server-to-server) send neither header and are
 * allowed through — auth is still authoritative for these panel-only routes;
 * key-authed server-to-server routes never call this.
 */
export function isSameOriginRequest(req: Request): boolean {
  const appOrigin = appOriginOf(process.env.APP_URL);
  const origin = req.headers.get("origin");
  if (origin) return matchesOrigin(origin, appOrigin, req);
  const referer = req.headers.get("referer");
  if (referer) return matchesOrigin(referer, appOrigin, req);
  // No Origin/Referer (curl, server-to-server, older clients): allow — the
  // session cookie check that follows is still authoritative.
  return true;
}

function appOriginOf(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin.toLowerCase();
  } catch {
    return null;
  }
}

function matchesOrigin(candidate: string, appOrigin: string | null, req: Request): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (appOrigin) return url.origin.toLowerCase() === appOrigin;
  // APP_URL unset (dev/e2e): compare full host+port against the request Host
  // so at least scheme-relative spoofing and cross-port access are caught.
  const reqHost = req.headers.get("host")?.toLowerCase();
  return reqHost ? url.host.toLowerCase() === reqHost : false;
}
