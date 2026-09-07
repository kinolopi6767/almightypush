import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id, timestamps, workspaceRef } from "./common";

/** The "project" container — one panel can host many workspaces. */
export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  /** Future plan limits (tiers): { can_use_automation, max_domains, ... } */
  capabilities_json: text("capabilities_json").notNull().default("{}"),
  ...timestamps(),
});

/** Single owner today; schema allows multiple users + roles later. */
export const users = sqliteTable(
  "users",
  {
    id: id(),
    workspace_id: integer("workspace_id").references(() => workspaces.id),
    email: text("email").notNull().unique(),
    name: text("name"),
    /** argon2id hash */
    password_hash: text("password_hash"),
    totp_secret: text("totp_secret"),
    totp_enabled: integer("totp_enabled").notNull().default(0),
    // Default viewer (least privilege): any user-creation path that omits
    // role must NEVER mint owners (privesc). The /setup bootstrap sets
    // role=owner explicitly for the first user.
    /** owner | admin | editor | viewer */
    role: text("role").notNull().default("viewer"),
    last_login_at: text("last_login_at"),
    ...timestamps(),
  },
  // NOTE: no explicit uniqueIndex here — the `.unique()` column constraint
  // already emits `users_email_unique` (a second index was dropped in 0010).
);

// NOTE: a `sessions` table existed here historically but was dropped in
// migration 0015 — Auth.js runs JWT strategy (stateless), so no code path
// ever read or wrote it. Do not re-add without a DB-backed session design.

/** Global panel settings (key/value). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** NULL = all domains of the workspace */
    domain_id: integer("domain_id"),
    label: text("label").notNull(),
    token_hash: text("token_hash").notNull(),
    scope_json: text("scope_json").notNull().default("{}"),
    last_used_at: text("last_used_at"),
    expires_at: text("expires_at"),
    ...timestamps(),
  },
  (t) => [index("idx_api_keys_ws").on(t.workspace_id), index("idx_api_keys_token").on(t.token_hash)],
);

export const backups = sqliteTable("backups", {
  id: id(),
  /** manual | auto */
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  size_bytes: integer("size_bytes").notNull().default(0),
  location: text("location"),
  ...timestamps(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    user_id: integer("user_id"),
    action: text("action").notNull(),
    entity_type: text("entity_type"),
    entity_id: integer("entity_id"),
    meta_json: text("meta_json"),
    ts: text("ts")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_audit_ws_ts").on(t.workspace_id, t.ts)],
);
