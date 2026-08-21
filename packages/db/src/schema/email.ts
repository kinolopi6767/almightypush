import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id, timestamps, workspaceRef } from "./common";
import { workspaces } from "./core";

/** LumaPush: email contacts (unified audience alongside push subscribers) */
export const emailContacts = sqliteTable(
  "email_contacts",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    /** verified | pending | bounced | unsubscribed */
    status: text("status").notNull().default("pending"),
    tags_json: text("tags_json").notNull().default("[]"),
    /** { country, city, device, ... } last known attrs */
    attrs_json: text("attrs_json").notNull().default("{}"),
    subscribe_at: text("subscribe_at"),
    last_open_at: text("last_open_at"),
    ...timestamps(),
  },
  (t) => [
    index("idx_email_contacts_ws").on(t.workspace_id),
    index("idx_email_contacts_ws_email").on(t.workspace_id, t.email),
    index("idx_email_contacts_status").on(t.status),
  ],
);

/** Per-workspace sending domain (SPF/DKIM/DMARC) */
export const emailSendingDomains = sqliteTable(
  "email_sending_domains",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    /** pending | verified | failed */
    status: text("status").notNull().default("pending"),
    spf_verified: integer("spf_verified").notNull().default(0),
    dkim_verified: integer("dkim_verified").notNull().default(0),
    dmarc_verified: integer("dmarc_verified").notNull().default(0),
    selector: text("selector").notNull().default("luma"),
    dkim_key: text("dkim_key"),
    ...timestamps(),
  },
  (t) => [index("idx_email_domains_ws").on(t.workspace_id)],
);

/** Email campaigns (separate from push campaigns for deliverability tracking) */
export const emailCampaigns = sqliteTable(
  "email_campaigns",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    preheader: text("preheader"),
    html: text("html"),
    /** MJML/JSON blocks for drag-drop builder */
    blocks_json: text("blocks_json"),
    from_domain_id: integer("from_domain_id").references(() => emailSendingDomains.id),
    from_email: text("from_email"),
    audience_json: text("audience_json").notNull().default("{}"),
    /** draft | scheduled | sending | done | failed | cancelled */
    status: text("status").notNull().default("draft"),
    schedule_at: text("schedule_at"),
    /** stats: { sent, delivered, opened, clicked, bounced } */
    stats_json: text("stats_json").notNull().default("{}"),
    sent_at: text("sent_at"),
    ...timestamps(),
  },
  (t) => [index("idx_email_campaigns_ws").on(t.workspace_id, t.status, t.sent_at)],
);

/** Per-campaign A/B variants (LumaPush up to 10, OneSignal up to 10) — polymorphic push/email */
export const campaignVariants = sqliteTable(
  "campaign_variants",
  {
    id: id(),
    campaign_id: integer("campaign_id").notNull(),
    channel: text("channel").notNull().default("push"), // push | email
    variant_key: text("variant_key").notNull(), // A, B, C...
    title: text("title"),
    message: text("message"),
    image_url: text("image_url"),
    html: text("html"),
    subject: text("subject"),
    /** traffic % 0-100 */
    weight: integer("weight").notNull().default(50),
    clicks: integer("clicks").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_campaign_variants_camp").on(t.campaign_id), index("idx_campaign_variants_channel").on(t.channel)],
);

/** Subscriber tags (custom attributes, LumaPush 1→unlimited, EngageLab alias) */
export const subscriberTags = sqliteTable(
  "subscriber_tags",
  {
    id: id(),
    subscriber_id: integer("subscriber_id").notNull(),
    tag: text("tag").notNull(),
    value: text("value"),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_subscriber_tags_sub").on(t.subscriber_id), index("idx_subscriber_tags_tag").on(t.tag)],
);

/** Journeys — visual workflow (LumaPush + OneSignal Journeys + Braze Canvas) */
export const journeys = sqliteTable(
  "journeys",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    domain_id: integer("domain_id"),
    name: text("name").notNull(),
    /** draft | active | paused | archived */
    status: text("status").notNull().default("draft"),
    /** { nodes:[{id,type,config,next}], edges:[{from,to,condition}], triggers:[...] } */
    canvas_json: text("canvas_json").notNull().default("{}"),
    /** trigger: subscribe | rss | event | api | inactivity */
    trigger_type: text("trigger_type").notNull().default("subscribe"),
    trigger_config_json: text("trigger_config_json").notNull().default("{}"),
    stats_json: text("stats_json").notNull().default("{}"),
    last_run_at: text("last_run_at"),
    next_run_at: text("next_run_at"),
    ...timestamps(),
  },
  (t) => [index("idx_journeys_ws_status").on(t.workspace_id, t.status)],
);

export const journeyRuns = sqliteTable(
  "journey_runs",
  {
    id: id(),
    journey_id: integer("journey_id").notNull().references(() => journeys.id, { onDelete: "cascade" }),
    subscriber_id: integer("subscriber_id"),
    email_contact_id: integer("email_contact_id"),
    /** awaiting | sent | opened | clicked | bounced | failed */
    status: text("status").notNull().default("awaiting"),
    step_id: text("step_id"),
    detail: text("detail"),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_journey_runs_journey").on(t.journey_id, t.created_at)],
);

/** AI generations (Command Studio, Hook, Spam Score, Translate, AutoMagic) */
export const aiGenerations = sqliteTable(
  "ai_generations",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // hook | spam_score | translate | url_to_campaign | automagic | image
    prompt: text("prompt"),
    input_json: text("input_json"),
    output_json: text("output_json"),
    model: text("model"),
    tokens: integer("tokens").notNull().default(0),
    created_at: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index("idx_ai_gen_ws_kind").on(t.workspace_id, t.kind)],
);

/** Frequency caps / Fatigue Shield per subscriber */
export const frequencyCaps = sqliteTable(
  "frequency_caps",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    subscriber_id: integer("subscriber_id"),
    email_contact_id: integer("email_contact_id"),
    /** YYYY-MM-DD */
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
    last_sent_at: text("last_sent_at"),
  },
  (t) => [index("idx_freq_caps_ws_day").on(t.workspace_id, t.day), index("idx_freq_caps_sub_day").on(t.subscriber_id, t.day)],
);

/** Team invites (RBAC already in users.role owner/admin/editor/viewer) */
export const teamInvites = sqliteTable(
  "team_invites",
  {
    id: id(),
    workspace_id: workspaceRef().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    token_hash: text("token_hash").notNull(),
    expires_at: text("expires_at"),
    accepted_at: text("accepted_at"),
    ...timestamps(),
  },
  (t) => [index("idx_team_invites_ws").on(t.workspace_id)],
);
