# syntax=docker/dockerfile:1
# Two processes (web + worker) run from ONE image against a shared SQLite volume.

# ---------- deps ----------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/tsconfig ./packages/tsconfig
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
COPY . .
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
WORKDIR /app
RUN pnpm turbo run build --filter=@pushpanel/web --filter=@pushpanel/worker

# ---------- runtime ----------
FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
ENV NODE_ENV=production PORT=3000
WORKDIR /app

# Web: Next standalone server (self-contained) + its traced node_modules.
COPY --from=build /app/apps/web/.next/standalone ./

# Standalone output does not include public/ — the SDK bundle, service
# worker, manifest and icons live there and must be served at /.
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

# Worker: bundled ESM (native deps resolved from the traced node_modules).
COPY --from=build /app/apps/worker/dist/index.mjs ./worker/index.mjs

# FIX: standalone trace misses native argon2/better-sqlite3 platform binaries — copy from deps
COPY --from=deps /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/.pnpm ./node_modules/.pnpm
# Ensure drizzle-orm is present for runtime (externalized)
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Shared data volume (SQLite + WAL + backups).
VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/pushpanel.db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1 || exit 1

CMD ["node", "./apps/web/server.js"]