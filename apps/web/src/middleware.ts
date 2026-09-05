import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const PUBLIC_PATHS = ["/login", "/setup", "/demo", "/invite", "/api/auth", "/api/health", "/api/v1", "/p/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/sdk/", "/sw.js"];

/** Segment-aware public match: "/api/v1" must not match "/api/v1xyz". */
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isStatic = pathname.startsWith("/_next") || pathname === "/favicon.ico";

  if (isStatic || isPublicPath(pathname)) return;
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
  // Premium: add security headers at edge for authenticated routes
  // (CSP is in next.config, but we add per-request nonce hints here if needed)
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};