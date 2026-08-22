import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const PUBLIC_PATHS = ["/login", "/setup", "/demo", "/api/auth", "/api/health", "/api/metrics", "/api/v1", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/sdk/", "/sw.js"];

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
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};