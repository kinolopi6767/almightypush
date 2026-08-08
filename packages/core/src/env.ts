import { z } from "zod";

/**
 * Shared environment schema. Each app validates a subset:
 * - web (panel + SDK routes): everything except worker-only vars.
 * - worker: DB + runtime knobs (SEND_* etc. arrive in later milestones).
 */
export const baseEnvSchema = z.object({
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