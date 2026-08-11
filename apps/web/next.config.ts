import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [],
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
        ],
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