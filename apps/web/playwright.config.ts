import { defineConfig } from "@playwright/test";
import { resolveDbPath } from "@pushpanel/db";

// Ephemeral DB per run — first-run setup tests must never see stale state.
// Absolute via resolveDbPath so every process (web server, worker, spec
// assertions) agrees on the same file regardless of its cwd. The path is
// cached in process.env because Playwright re-evaluates this config module
// once per worker process — Date.now() here would otherwise diverge.
process.env.E2E_DB_PATH ??= resolveDbPath(`./data/e2e-${Date.now()}.db`);
const dbPath = process.env.E2E_DB_PATH as string;

const appEnv = {
  DATABASE_PATH: dbPath,
  // Auth.js requires an explicit secret outside interactive dev shells.
  AUTH_SECRET: "pushpanel-e2e-secret-change-me-0123456789abcdef",
  // Used by subscribe/domain routes to encrypt subscription + VAPID keys at rest.
  APP_ENC_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  // Tests use a self-signed TLS mock push service (web-push always uses https).
  NODE_TLS_REJECT_UNAUTHORIZED: "0",
  // E2E signs in repeatedly and rapidly; disable the login brute-force guard.
  LOGIN_RATE_LIMIT: "1000",
  SUBSCRIBE_RATE_LIMIT: "1000",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // One process: specs share one ephemeral SQLite DB + one web server.
  // Parallel workers would race the first-run setup and DB migrations.
  workers: 1,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // Production build (must run `pnpm build` first, like CI): `next dev` is
    // flaky under e2e — its compiler stalls requests intermittently on cold
    // runs, hanging navigations for the full test timeout.
    command: "pnpm exec next start -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: appEnv,
  },
});
