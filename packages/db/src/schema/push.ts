import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { id, workspaceRef } from "./common";
import { workspaces } from "./core";
import { campaigns } from "./marketing";

/** A website with its own push credentials (VAPID keypair or FCM config),
 *  prompt settings and subscribers. */

/**
 * A website with its own push credentials (VAPID keypair or FCM config),
 * prompt settings and subscribers.
 */
export const domains = sqliteTable(
  "domains",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** hostname, lowercased, unique per workspace */
    name: text("name").notNull(),
    /** vapid | fcm */
    provider: text("provider").notNull().default("vapid"),
    /** { vapidPublicKey, vapidPrivateKeyEnc, vapidSubject } or FCM project config */
    provider_config_json: text("provider_config_json"),
    /** prompt settings per domain (kind, texts, delays, positioning...) */
    app_config_json: text("app_config_json"),
    /** active | paused */
    status: text("status").notNull().default("active"),
    subscribers_count: integer("subscribers_count").notNull().default(0),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updated_at: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
      .$onUpdateFn(() => new Date().toISOString()),
  },
  (t) => [uniqueIndex("idx_domains_ws_name").on(t.workspace_id, t.name)],
);

export const subscribers = sqliteTable(
  "subscribers",
  {
    id: id(),
    domain_id: integer("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    /** AES-256-GCM encrypted at rest (plaintext only transiently in provider) */
    token: text("token"),
    /** sha256 of the raw token — dedupe + lookup without plaintext search */
    token_hash: text("token_hash").notNull(),
    /** vapid | fcm */
    provider: text("provider").notNull().default("vapid"),
    device: text("device"),
    os: text("os"),
    browser: text("browser"),
    country: text("country"),
    state: text("state"),
    subscribe_url: text("subscribe_url"),
    subscribe_at: text("subscribe_at"),
    last_active_at: text("last_active_at"),
    /** NULL = still subscribed */
    unsubscribed_at: text("unsubscribed_at"),
    unsub_reason: text("unsub_reason"),
    meta_json: text("meta_json"),
  },
  (t) => [
    index("idx_subs_domain").on(t.domain_id, t.unsubscribed_at),
    index("idx_subs_domain_date").on(t.domain_id, t.subscribe_at),
    index("idx_subs_domain_geo").on(t.domain_id, t.country, t.state),
    index("idx_subs_domain_dev").on(t.domain_id, t.device, t.browser, t.os),
    // Partial unique — one active subscription per domain+token.
    // Predicate is a raw SQL fragment to avoid a self-referencing closure.
    uniqueIndex("idx_subs_active_token")
      .on(t.domain_id, t.token_hash)
      .where(sql`unsubscribed_at IS NULL`),
  ],
);

/** Sender engine queue — one row per (campaign, subscriber). */
export const deliveries = sqliteTable(
  "deliveries",
  {
    id: id(),
    campaign_id: integer("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    subscriber_id: integer("subscriber_id").references(() => subscribers.id, {
      onDelete: "set null",
    }),
    domain_id: integer("domain_id").notNull(),
    /** queued | sending | sent | failed | unsubscribed(410) | cancelled */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    next_attempt_at: integer("next_attempt_at"),
    /** when this row was claimed as `sending` — crash recovery requeues stale claims */
    claimed_at: integer("claimed_at"),
    error: text("error"),
    provider_msg: text("provider_msg"),
    requested_at: integer("requested_at"),
    sent_at: integer("sent_at"),
  },
  (t) => [
    index("idx_deliv_camp_status").on(t.campaign_id, t.status, t.next_attempt_at),
    index("idx_deliv_domain").on(t.domain_id, t.status),
  ],
);

/** Analytics backbone — every event one row (monotonic id doubles as cursor). */
export const events = sqliteTable(
  "events",
  {
    id: id(),
    domain_id: integer("domain_id").notNull(),
    campaign_id: integer("campaign_id"),
    subscriber_id: integer("subscriber_id"),
    /** subscribed | delivered | clicked | unsubscribed | link_click | impression */
    type: text("type").notNull(),
    /** { button_index?, target_url?, ... } */
    meta_json: text("meta_json"),
    ts: text("ts")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_events_domain_ts").on(t.domain_id, t.ts),
    index("idx_events_camp").on(t.campaign_id, t.type),
  ],
);