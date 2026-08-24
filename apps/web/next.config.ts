import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [],
  // Cache dynamic (auth-gated) RSC payloads client-side so sidebar navigation
  // between already-visited pages is instant instead of a server roundtrip.
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  serverExternalPackages: [
    "@pushpanel/db",
    "@pushpanel/core",
    "better-sqlite3",
    "drizzle-orm",
    "drizzle-kit",
    "@node-rs/argon2",
  ],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // HSTS only on HTTPS — browsers ignore on HTTP, safe to send always when behind proxy that terminates TLS
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // CSP: production drops 'unsafe-eval' and the blanket https: script
          // source (the app loads zero third-party scripts — everything is
          // same-origin). 'unsafe-inline' stays for Next's bootstrap/hydration
          // inline scripts; img/connect keep https: because campaign icons and
          // customer-site SDK traffic legitimately reach any origin.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === "production"
                ? "script-src 'self' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join("; "),
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        // Cache SDK and SW correctly: immutable for versioned assets, no-cache for dynamic
        source: "/sdk/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  eslint: {
    // Lint runs in CI at the monorepo level.
    ignoreDuringBuilds: true,
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // pnpm store symlinks defeat Next's package-name externals resolution;
      // force native-binding / driver packages out of the bundle explicitly.
      config.externals = [
        ...(config.externals ?? []),
        { "@node-rs/argon2": "commonjs @node-rs/argon2" },
        { "better-sqlite3": "commonjs better-sqlite3" },
        { "drizzle-orm": "commonjs drizzle-orm" },
      ];
    }
    return config;
  },
};

export default nextConfig;