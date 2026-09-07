import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const PUBLIC_PATHS = ["/login", "/setup", "/demo", "/invite", "/api/auth", "/api/health", "/p/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/sdk/", "/sw.js"];

// Fail-closed public API allowlist: every FUTURE /api/v1/* route defaults to
// authenticated. Only the SDK/browser routes that must work without a panel
// session are listed here — each still enforces its own origin/rate-limit/HMAC
// checks. Server-to-server routes (send/stats/track) and panel authed routes
// (ai/*, journeys, test-connection) are intentionally NOT public at the edge.
const PUBLIC_V1_PREFIXES = [
  "/api/v1/info",
  "/api/v1/subscribe",
  "/api/v1/resubscribe",
  "/api/v1/unsubscribe",
  "/api/v1/tags",
  "/api/v1/optin",
  "/api/v1/click",
  "/api/v1/lp/",
  "/api/v1/plugin/",
  "/api/v1/openapi.json",
  "/api/v1/automations/",
];

// Server-to-server routes authed via X-Api-Key (no panel session). The edge
// cannot validate the key (needs DB), so it only checks *presence* here and
// lets the route handler enforce validity. Without this, key-only callers
// get a 307 redirect to /login HTML instead of JSON.
const KEY_V1_PREFIXES = ["/api/v1/send", "/api/v1/stats", "/api/v1/track"];

/** Segment-aware public match: "/api/v1" must not match "/api/v1xyz". */
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)))) {
    return true;
  }
  if (pathname.startsWith("/api/v1/") || pathname === "/api/v1") {
    return PUBLIC_V1_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  }
  return false;
}

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isStatic = pathname.startsWith("/_next") || pathname === "/favicon.ico";

  if (isStatic || isPublicPath(pathname)) return;
  // Key-authed server-to-server routes: presence of X-Api-Key lets the
  // request through to the route handler, which validates it against the DB.
  if (KEY_V1_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (req.headers.get("x-api-key")) return;
  }
  if (!req.auth) {
    // Premium security: preserve intended destination for post-login redirect
    // but avoid open-redirect via external hosts.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Only preserve same-origin paths that are not auth pages
    if (pathname.startsWith("/dashboard")) {
      url.searchParams.set("callbackUrl", pathname);
    }
    return Response.redirect(url);
  }
  // Security headers (CSP, HSTS, X-Frame-Options, ...) are set in
  // next.config.ts headers() for all routes including public ones.
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};