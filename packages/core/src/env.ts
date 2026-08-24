import { z } from "zod";

/**
 * Shared environment schema. Each app validates a subset:
 * - web (panel + SDK routes): everything except worker-only vars.
 * - worker: DB + runtime knobs (SEND_* etc. arrive in later milestones).
 */
export const baseEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Absolute or repo-relative path to the SQLite file */
    DATABASE_PATH: z.string().min(1).default("./data/pushpanel.db"),
    /** 32-byte hex key for AES-256-GCM at-rest encryption */
    APP_ENC_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "APP_ENC_KEY must be 64 hex chars (32 bytes)")
      .optional(),
    /** Panel base URL without trailing slash, e.g. https://push.example.com */
    APP_URL: z
      .string()
      .url()
      .transform((u) => u.replace(/\/$/, ""))
      .optional(),
    AUTH_SECRET: z.string().min(16).optional(),
    /** Bootstrap owner account created on first run (email only; password set via /setup). */
    OWNER_EMAIL: z.string().email().optional(),
    OWNER_NAME: z.string().min(1).optional(),
    DEFAULT_TIMEZONE: z.string().default("UTC"),
    /** When 1, X-Forwarded-For is trusted for rate limiting (behind reverse proxy). */
    TRUST_PROXY: z.enum(["0", "1"]).optional(),
    /** You.com API key for web-grounded AI (Search + Research). Free tier works without it. */
    YDC_API_KEY: z.string().min(1).optional(),
    YOU_API_KEY: z.string().min(1).optional(),
    YDC_API_BASE_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.APP_ENC_KEY) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_ENC_KEY"], message: "APP_ENC_KEY is required in production (64 hex chars)" });
      if (!data.AUTH_SECRET) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_SECRET"], message: "AUTH_SECRET is required in production" });
      if (!data.APP_URL) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_URL"], message: "APP_URL is required in production (https://...)" });
    }
  });

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export function parseEnv(schema: z.ZodType, raw: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}