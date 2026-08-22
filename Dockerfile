# syntax=docker/dockerfile:1
# Two processes (web + worker) run from ONE image against a shared SQLite volume.
# Uses .npmrc node-linker=hoisted for flat node_modules — no pnpm symlinks,
# so Next.js standalone tracing correctly includes native binaries (argon2, better-sqlite3).

# ---------- deps ----------
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json .npmrc ./
COPY packages/tsconfig ./packages/tsconfig
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/core/package.json ./packages/core/
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
WORKDIR /app
COPY . .
RUN pnpm turbo run build --filter=@pushpanel/web --filter=@pushpanel/worker

# ---------- runtime ----------
FROM node:22-alpine AS runtime
RUN apk add --no-cache wget
ENV NODE_ENV=production PORT=3000
WORKDIR /app

# Web: Next standalone server + traced deps (hoisted = argon2/better-sqlite3 included)
COPY --from=build /app/apps/web/.next/standalone ./

# Standalone output does not include public/ or .next/static
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

# Worker: bundled ESM (native deps resolved from traced node_modules)
COPY --from=build /app/apps/worker/dist/index.mjs ./worker/index.mjs

# Safety net: copy hoisted native binaries into standalone node_modules if trace missed them
RUN mkdir -p ./node_modules/@node-rs && \
  cp -rL /app/node_modules/@node-rs/argon2* ./node_modules/@node-rs/ 2>/dev/null || true

# Ensure data dir exists with writable perms before VOLUME
RUN mkdir -p /app/data && chmod 755 /app/data

# Shared data volume (SQLite + WAL + backups).
VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/pushpanel.db

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "./apps/web/server.js"]
