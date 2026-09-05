import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Premium performance: cache + compression + optimized RSC streaming.
  // NOTE: drizzle-orm stays bundled (optimizePackageImports) — it must NOT
  // also be listed in serverExternalPackages/webpack externals, which Next
  // 15 rejects as a transpile-vs-external conflict and which would defeat
  // tree-shaking. Only native/binding packages go external.
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
    optimizePackageImports: ["recharts", "drizzle-orm"],
  },
  compress: true,
  serverExternalPackages: [
    "@pushpanel/db",
    "@pushpanel/core",
    "better-sqlite3",
    "@node-rs/argon2",
    "undici",
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
          { key: "X-XSS-Protection", value: "0" },
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
        // SDK is served unversioned — a year-long immutable cache would pin
        // visitor browsers to whatever engine shipped when they first hit
        // the snippet. Revalidate hourly; SW stays must-revalidate.
        source: "/sdk/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
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
      // force native-binding packages out of the bundle explicitly.
      // (drizzle-orm is intentionally bundled — see note above.)
      config.externals = [
        ...(config.externals ?? []),
        { "@node-rs/argon2": "commonjs @node-rs/argon2" },
        { "better-sqlite3": "commonjs better-sqlite3" },
      ];
    }
    return config;
  },
};

export default nextConfig;