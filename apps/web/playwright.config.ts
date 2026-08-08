import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "pnpm dev --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Ephemeral DB per run — first-run setup tests must never see stale state.
      DATABASE_PATH: `./data/e2e-${Date.now()}.db`,
      // Auth.js requires an explicit secret outside interactive dev shells.
      AUTH_SECRET: "pushpanel-e2e-secret-change-me-0123456789abcdef",
    },
  },
});