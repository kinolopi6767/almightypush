import { z } from "zod";

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
] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

export const automationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  icon_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  image_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  launch_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});
export type AutomationPayload = z.infer<typeof automationPayloadSchema>;

export const automationConfigSchema = z.object({
  payload: automationPayloadSchema,
  /** welcome_push: seconds between subscribe and send (uses scheduled campaigns). */
  delay_seconds: z.coerce.number().int().min(0).max(86_400).default(0),
  /** poll types: how often the worker re-runs (minutes). */
  interval_minutes: z.coerce.number().int().min(1).max(10_080).default(15),
  /** automagic_dynamic: WordPress REST API base URL. */
  source_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  /** automagic_dynamic: how many recent posts to pick from. */
  range: z.coerce.number().int().min(1).max(100).default(10),
  /** automagic_static: JSON array of {title, message?, launch_url?}. */
  rotation_json: z.string().trim().optional().or(z.literal("")),
  /** youtube_push: RSS feed URL (autodiscovered at creation). */
  feed_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  /** push_on_publish: webhook auth secret (generated at creation). */
  secret: z.string().min(16).max(256).optional(),
  /** internal: round-robin cursor for automagic_static. */
  rotation_index: z.coerce.number().int().min(0).optional(),
  /** internal: last sent youtube video id (dedupe). */
  last_video_id: z.string().optional(),
});
export type AutomationConfig = z.infer<typeof automationConfigSchema>;

export const AUTOMATION_TYPE_LABEL: Record<AutomationType, string> = {
  welcome_push: "Welcome push",
  push_on_publish: "Push on publish (webhook)",
  automagic_dynamic: "AutoMagic dynamic",
  automagic_static: "AutoMagic static",
  youtube_push: "YouTube push",
};

export function parseAutomationConfig(json: string | null | undefined): AutomationConfig {
  try {
    const parsed = automationConfigSchema.safeParse(json ? JSON.parse(json) : {});
    return parsed.success ? parsed.data : { payload: { title: "" }, delay_seconds: 0, interval_minutes: 15, range: 10 };
  } catch {
    return { payload: { title: "" }, delay_seconds: 0, interval_minutes: 15, range: 10 };
  }
}