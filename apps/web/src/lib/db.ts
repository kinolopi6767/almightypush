import { getDb, setDbForTests, type BetterSQLite3Database } from "@pushpanel/db";
import { allTables } from "@pushpanel/db/schema";
import { logger } from "./logger";

type PushDb = BetterSQLite3Database<typeof allTables>;

/**
 * Single shared connection for the web process (WAL single-writer discipline).
 * Access via a Proxy so mere module evaluation (e.g. Next.js "collecting page
 * data" at build time) never opens the database — the connection is created
 * lazily on the first member access inside an actual request.
 */
export const db = new Proxy({} as PushDb, {
  get(_target, prop) {
    try {
      return Reflect.get(getDb(), prop);
    } catch (err) {
      // Never crash the process on DB open failure — log structurally so
      // error boundaries can render while ops still see the trail.
      logger.error("db connection failed", { route: "lib/db", error: err });
      throw err;
    }
  },
});

export { setDbForTests };