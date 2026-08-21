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
# pnpm 10 blocks build scripts by default (better-sqlite3 / argon2 native bindings) — rebuild them
RUN pnpm approve-builds 2>/dev/null || true
RUN pnpm rebuild better-sqlite3 @node-rs/argon2 2>/dev/null || npm rebuild better-sqlite3 @node-rs/argon2 2>/dev/null || true

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

# FIX: Next standalone trace misses native binaries with pnpm isolated store.
# Overlay full deps node_modules (with built .node files) on top of standalone's pruned one.
# This ensures @node-rs/argon2 + better-sqlite3 are present at runtime regardless of tracing.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Shared data volume (SQLite + WAL + backups).
VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/pushpanel.db

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1 || exit 1

CMD ["node", "./apps/web/server.js"]