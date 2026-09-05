#!/usr/bin/env node
/**
 * Prune Playwright e2e debris (data/e2e-*.db* + orphaned WAL/SHM).
 * Safe: only matches `e2e-*.db*`; never touches pushpanel.db or backups/.
 *
 * Usage: pnpm cleanup:e2e [--dry-run] [--days=3]
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const dataDir = path.join(root, "data");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.find((a) => a.startsWith("--days="));
const maxAgeMs = Number(daysArg?.split("=")[1] ?? 3) * 86_400_000;
const now = Date.now();

let removed = 0;
let kept = 0;
try {
  for (const name of readdirSync(dataDir)) {
    if (!name.startsWith("e2e-") || (!name.endsWith(".db") && !name.includes(".db-"))) continue;
    const full = path.join(dataDir, name);
    let age = Infinity;
    try {
      age = now - statSync(full).mtimeMs;
    } catch {
      continue;
    }
    if (age < maxAgeMs) {
      kept++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] would remove ${name}`);
    } else {
      try {
        rmSync(full, { force: true });
      } catch {
        continue;
      }
    }
    removed++;
  }
} catch (err) {
  console.error(`[prune-e2e] ${dataDir} unreadable:`, (err as Error).message);
  process.exit(1);
}
console.log(`[prune-e2e] removed=${removed} kept=${kept} dryRun=${dryRun}`);
