import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const PUBLIC_PATHS = ["/login", "/setup", "/demo", "/api/auth", "/api/health", "/api/metrics", "/api/v1", "/s/"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  const isStatic = pathname.startsWith("/_next") || pathname === "/favicon.ico";

  if (isStatic || isPublic) return;
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};