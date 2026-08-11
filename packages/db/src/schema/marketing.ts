import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id, timestamps, workspaceRef } from "./common";
import { workspaces } from "./core";

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** NULL = multi-domain */
    domain_id: integer("domain_id"),
    title: text("title").notNull(),
    /** E7: B-variant title for 50/50 A/B testing (NULL = single title) */
    title_b: text("title_b"),
    message: text("message"),
    icon_url: text("icon_url"),
    image_url: text("image_url"),
    launch_url: text("launch_url"),
    /** [{ label, icon, url }] */
    buttons_json: text("buttons_json"),
    /** { kind: 'all' | 'manual' | 'segment', ids: [] } */
    audience_json: text("audience_json").notNull().default("{}"),
    schedule_at: text("schedule_at"),
    schedule_tz: text("schedule_tz"),
    scheduled: integer("scheduled").notNull().default(0),
    /** draft | scheduled | sending | paused | done | failed | cancelled */
    status: text("status").notNull().default("draft"),
    /** panel | api | wordpress | automation */
    source: text("source").notNull().default("panel"),
    template_id: integer("template_id"),
    /** { accepted, delivered, clicked, perButton: {...} } */
    stats_json: text("stats_json").notNull().default("{}"),
    sent_at: text("sent_at"),
    ...timestamps(),
  },
  (t) => [index("idx_campaigns_ws").on(t.workspace_id, t.status, t.sent_at)],
);

export const templates = sqliteTable("templates", {
  id: id(),
  workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title"),
  message: text("message"),
  icon_url: text("icon_url"),
  image_url: text("image_url"),
  launch_url: text("launch_url"),
  buttons_json: text("buttons_json"),
  ...timestamps(),
});

/**
 * Whitelist-based audience builder. conditions_json:
 * { groups: [{ logic: 'AND' | 'OR', conditions: [{ field, op, value }] }] }
 */
export const segments = sqliteTable("segments", {
  id: id(),
  workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** NULL = all domains */
  domain_ids_json: text("domain_ids_json"),
  name: text("name").notNull(),
  conditions_json: text("conditions_json").notNull().default("[]"),
  estimate_count: integer("estimate_count"),
  estimate_at: text("estimate_at"),
  last_used_at: text("last_used_at"),
  ...timestamps(),
});

export const automations = sqliteTable(
  "automations",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    domain_id: integer("domain_id"),
    /** automagic_dynamic | automagic_static | welcome_push | push_on_publish | youtube_push | drip | webhook */
    type: text("type").notNull(),
    name: text("name").notNull(),
    /** source_url, range, static fields, schedule_cron, prompt opts, delay, step sequences... */
    config_json: text("config_json").notNull().default("{}"),
    audience_json: text("audience_json").notNull().default("{}"),
    status: text("status").notNull().default("active"),
    last_run_at: text("last_run_at"),
    next_run_at: text("next_run_at"),
    error: text("error"),
    /** consecutive poll failures since the last success (auto-pause). */
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("idx_automations_next").on(t.status, t.next_run_at)],
);

/** Per-run log for automations — one row per tick/webhook-triggered run. */
export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: id(),
    automation_id: integer("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    /** ok | error */
    status: text("status").notNull(),
    detail: text("detail"),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_automation_runs_auto").on(t.automation_id, t.created_at)],
);

/** Collection links with redirect + optional force-subscribe. */
export const lpLinks = sqliteTable("lp_links", {
  id: id(),
  workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  domain_id: integer("domain_id"),
  code: text("code").notNull().unique(),
  target_url: text("target_url").notNull(),
  prompt_text: text("prompt_text"),
  force_subscribe: integer("force_subscribe").notNull().default(0),
  clicks_count: integer("clicks_count").notNull().default(0),
  subscribers_count: integer("subscribers_count").notNull().default(0),
  /** fallback target after the link is deleted (default 404) */
  deleted_target_url: text("deleted_target_url"),
  /** set when the link is tombstoned (falls back to deleted_target_url) */
  deleted_at: text("deleted_at"),
  ...timestamps(),
});

export const youtubeChannels = sqliteTable("youtube_channels", {
  id: id(),
  workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  domain_id: integer("domain_id"),
  title: text("title"),
  channel_url: text("channel_url").notNull(),
  /** feed autodiscovered from the channel page */
  feed_url: text("feed_url"),
  prompt_text: text("prompt_text"),
  force_subscribe: integer("force_subscribe").notNull().default(0),
  lp_code: text("lp_code"),
  clicks_count: integer("clicks_count").notNull().default(0),
  desktop_subs: integer("desktop_subs").notNull().default(0),
  mobile_subs: integer("mobile_subs").notNull().default(0),
  status: text("status").notNull().default("active"),
  last_video_at: text("last_video_at"),
  last_polled_at: text("last_polled_at"),
  ...timestamps(),
});