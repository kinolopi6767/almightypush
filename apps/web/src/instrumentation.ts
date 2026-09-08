/**
 * Web-process boot validation (fail-closed).
 *
 * The worker (`apps/worker/src/index.ts`) already calls `parseEnv`, but the
 * Next.js web server never did — so `ALLOW_PRIVATE_UPSTREAM=1` or a weak
 * `AUTH_SECRET` in production killed the worker while the web process kept
 * serving SSRF-able fetch routes (`/api/fetch-content`,
 * `/api/v1/ai/url-to-campaign`) with the guard disabled. Validating here
 * closes that gap: misconfigured production web boots refuse to start
 * instead of running half-secured.
 */
export async function register() {
  // Skip during `next build` (page-data collection runs without runtime env).
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Validate in the Node.js runtime (this app is Node-runtime-only); the
  // check is skipped on the edge runtime where process.env is unavailable.
  if (process.env.NEXT_RUNTIME !== "edge") {
    const { baseEnvSchema, parseEnv } = await import("@pushpanel/core");
    // Throws on invalid env in production (missing keys, weak AUTH_SECRET,
    // ALLOW_PRIVATE_UPSTREAM=1). Dev/test keep lenient defaults.
    parseEnv(baseEnvSchema);
  }
}
