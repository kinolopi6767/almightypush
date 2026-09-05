import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Layered suites (intentional, not duplication):
    // - src/**/*.test.ts = module unit tests (scheduler core paths, sender
    //   payload/UTM/variant paths, automation welcome/publish paths, cleanup,
    //   backup). Fast, seeded via lastInsertRowid.
    // - tests/**/*.test.ts = integration edge cases (audiences, segments,
    //   non-clickers, claim races, crontab re-arm, failure auto-pause).
    // Both layers run; keep new coverage in the matching layer.
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    pool: "forks",
  },
});