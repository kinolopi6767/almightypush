import "dotenv/config";

import { createSqlite, resolveDbPath, runMigrations } from "../index.js";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { allTables } from "../schema/index.js";

const path = resolveDbPath(process.env.DATABASE_PATH);

if (path === ":memory:") {
  throw new Error("DATABASE_PATH=:memory: is only valid for tests — set a file path to run migrations.");
}

const client = createSqlite(path);
const db = drizzle(client, { schema: allTables });
runMigrations(db, client);

console.log(`[db] migrations applied — ${path} (journal_mode=${client.pragma("journal_mode", { simple: true })})`);
client.close();