import { integer, text } from "drizzle-orm/sqlite-core";

export function timestamps() {
  return {
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updated_at: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdateFn(() => new Date().toISOString()),
  };
}

export function id() {
  return integer("id").primaryKey({ autoIncrement: true });
}

/** Plain workspace_id integer column — chain `.notNull().references(...)` at the call site. */
export function workspaceRef() {
  return integer("workspace_id");
}
