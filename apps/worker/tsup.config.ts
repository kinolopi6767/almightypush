import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  target: "node22",
  outExtension: () => ({ js: ".mjs" }),
  // Resolved at runtime from node_modules (native bindings must stay out of the bundle).
  external: ["@pushpanel/core", "@pushpanel/db", "better-sqlite3", "drizzle-orm", "zod", "dotenv"],
});