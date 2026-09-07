import { z } from "zod";
import { CronExpressionParser } from "cron-parser";

/**
 * Shared automation schemas (web forms + worker runner + API).
 * `config_json` on the automations row is the JSON form of `configSchema`.
 */

export const AUTOMATION_TYPES = [
  "welcome_push",
  "push_on_publish",
  "automagic_dynamic",
  "automagic_static",
  "youtube_push",
  "rss_push",
  "drip",
] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

const httpUrl = z.string().trim().refine((u) => u === "" || /^https?:\/\//i.test(u), "Must be an http(s) URL").pipe(z.string().max(500));

export const automationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  icon_url: httpUrl.optional().or(z.literal("")),
  image_url: httpUrl.optional().or(z.literal("")),
  launch_url: httpUrl.optional().or(z.literal("")),
});
export type AutomationPayload = z.infer<typeof automationPayloadSchema>;

/** C8: one step of a drip sequence — delay in days from the previous step. */
export const dripStepSchema = z.object({
  delay_days: z.coerce.number().int().min(0).max(365).default(0),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  launch_url: httpUrl.optional().or(z.literal("")),
});
export const MAX_DRIP_STEPS = 10;

export const automationConfigSchema = z.object({
  payload: automationPayloadSchema,
  /** welcome_push: seconds between subscribe and send (uses scheduled campaigns). */
  delay_seconds: z.coerce.number().int().min(0).max(86_400).default(0),
  /** poll types: how often the worker re-runs (minutes). */
  interval_minutes: z.coerce.number().int().min(1).max(10_080).default(15),
  /** poll types: optional 5-field crontab schedule (overrides interval_minutes when set). */
  schedule_cron: z.string().trim().min(1).max(100).optional().or(z.literal("")),
  /** automagic_dynamic: WordPress REST API base URL. */
  source_url: httpUrl.optional().or(z.literal("")),
  /** automagic_dynamic: how many recent posts to pick from. */
  range: z.coerce.number().int().min(1).max(100).default(10),
  /** automagic_static: JSON array of {title, message?, launch_url?}. */
  rotation_json: z.string().trim().max(50_000).optional().or(z.literal("")),
  /** youtube_push: RSS feed URL (autodiscovered at creation). */
  feed_url: httpUrl.optional().or(z.literal("")),
  /** push_on_publish: webhook auth secret (generated at creation). */
  secret: z.string().min(16).max(256).optional(),
  /** internal: round-robin cursor for automagic_static. */
  rotation_index: z.coerce.number().int().min(0).max(1_000_000).optional(),
  /** internal: last sent youtube video id (dedupe). */
  last_video_id: z.string().max(500).optional(),
  /** internal: last sent rss item key (dedupe). */
  last_item_guid: z.string().max(500).optional(),
  /** internal: newest accepted webhook timestamp (replay dedupe). */
  last_seen_ts: z.coerce.number().min(0).max(9_999_999_999_999).optional(),
  /** drip: ordered sequence of pushes, each delayed from the previous step. */
  steps: z.array(dripStepSchema).max(MAX_DRIP_STEPS).optional(),
});
export type AutomationConfig = z.infer<typeof automationConfigSchema>;

export const AUTOMATION_TYPE_LABEL: Record<AutomationType, string> = {
  welcome_push: "Welcome push",
  push_on_publish: "Push on publish (webhook)",
  automagic_dynamic: "AutoMagic dynamic",
  automagic_static: "AutoMagic static",
  youtube_push: "YouTube push",
  rss_push: "RSS publish",
  drip: "Drip sequence",
};

export function parseAutomationConfig(json: string | null | undefined): AutomationConfig | null {
  try {
    const parsed = automationConfigSchema.safeParse(json ? JSON.parse(json) : {});
    // Fail-closed: a corrupt config must NEVER degrade to a sendable default
    // (previous code returned {title:""} which downstream mapped to "New
    // update" and sent a real push). Callers must skip/fail the run on null.
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Lenient variant for read-only UI display: corrupt config → empty draft (never sent). */
export function parseAutomationConfigLenient(json: string | null | undefined): AutomationConfig {
  return (
    parseAutomationConfig(json) ?? { payload: { title: "" }, delay_seconds: 0, interval_minutes: 15, range: 10 }
  );
}

/**
 * C3: next fire time for a 5-field crontab expression, strictly after `from`.
 * Returns null when the expression is invalid or never fires.
 */
export function nextCronRun(expr: string, from: Date): Date | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  try {
    // Pinned to UTC: campaign schedule_at values are stored as UTC ISO and
    // bare-metal hosts with a local TZ must not shift fire times silently.
    const cron = CronExpressionParser.parse(trimmed, { currentDate: new Date(from.getTime() + 1000), tz: "UTC" });
    const next = cron.next();
    return next.toDate();
  } catch {
    return null;
  }
}

/** C3: whether an automation config schedules via crontab (no fallback to interval). */
export function hasCronSchedule(config: AutomationConfig): boolean {
  return typeof config.schedule_cron === "string" && config.schedule_cron.trim().length > 0;
}