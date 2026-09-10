import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { id, workspaceRef } from "./common";
import { workspaces } from "./core";
import { campaigns } from "./marketing";

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
    /** LumaPush: city-level geo (hyper-precision) + timezone for Smart Send */
    city: text("city"),
    timezone: text("timezone"),
    locale: text("locale"),
    screen_width: integer("screen_width"),
    screen_height: integer("screen_height"),
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
    index("idx_subs_domain_city").on(t.domain_id, t.city),
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
    /** E7: 'a' | 'b' — deterministic per-subscriber A/B split (NULL = single title) */
    variant: text("variant"),
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
    // Migration-only indexes (0009/0012) declared here so `drizzle-kit
    // generate` diffs against reality instead of emitting DROP INDEX.
    index("idx_deliveries_status_next").on(t.status, t.next_attempt_at),
    index("idx_deliveries_sent_at").on(t.sent_at),
    // Crash-recovery revive filters (status, claimed_at); per-subscriber
    // delivery history has no covering index otherwise (SQLite FKs are not
    // auto-indexed).
    index("idx_deliveries_status_claimed").on(t.status, t.claimed_at),
    index("idx_deliveries_subscriber").on(t.subscriber_id),
    // Migration-only indexes (0016) — retention pruning predicates.
    index("idx_deliveries_status_requested").on(t.status, t.requested_at),
    index("idx_deliveries_status_sent").on(t.status, t.sent_at),
    // One row per (campaign, subscriber): fan-out is idempotent via
    // ON CONFLICT DO NOTHING, so a retried/resumed enqueue can never
    // double-push. NULL subscriber ids stay distinct (SQLite semantics).
    uniqueIndex("idx_deliveries_camp_sub").on(t.campaign_id, t.subscriber_id),
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
    /** click attribution: the delivery that produced this event (partial-unique per clicked) */
    delivery_id: integer("delivery_id"),
    /** { button_index?, target_url?, ... } */
    meta_json: text("meta_json"),
    ts: text("ts")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [
    index("idx_events_domain_ts").on(t.domain_id, t.ts),
    index("idx_events_camp").on(t.campaign_id, t.type),
    // Fatigue counters range-filter ts per (subscriber, type) on every send —
    // without the trailing ts column each delivery scans 30d of rows.
    index("idx_events_subscriber_type_ts").on(t.subscriber_id, t.type, t.ts),
    index("idx_events_type_ts").on(t.type, t.ts),
    index("idx_events_ts").on(t.ts),
    // One clicked event per delivery — replay beacons can't double-count.
    uniqueIndex("idx_events_clicked_delivery")
      .on(t.delivery_id)
      .where(sql`type = 'clicked' AND delivery_id IS NOT NULL`),
    // Migration-only (0014) — non_clickers resend joins events(delivery_id).
    index("idx_events_delivery_id").on(t.delivery_id),
  ],
);