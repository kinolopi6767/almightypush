import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outDir: "dist",
  clean: true,
  target: "node22",
  outExtension: () => ({ js: ".cjs" }),
  // CJS output: bundled CJS deps (web-push etc.) keep native require() —
  // dynamic require() like web-push's require('crypto') is invalid in ESM.
  // Native bindings + heavy deps stay external (resolved from hoisted
  // node_modules at runtime). @pushpanel/* is force-bundled (noExternal) so the
  // worker image only needs real packages — no workspace symlinks to resolve.
  external: ["better-sqlite3", "drizzle-orm", "zod", "dotenv", "@node-rs/argon2"],
  noExternal: ["@pushpanel/core", "@pushpanel/db"],
});