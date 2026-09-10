import { z } from "zod";

/**
 * Shared environment schema. Each app validates a subset:
 * - web (panel + SDK routes): everything except worker-only vars.
 * - worker: DB path + APP_URL/keys; cadence knobs (WORKER_TICK_MS, batch
 *   sizes) are read defensively at use-site with clamped fallbacks.
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
    DEFAULT_TIMEZONE: z
      .string()
      .default("UTC")
      .refine(
        (tz) => {
          try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
          } catch {
            return false;
          }
        },
        { message: "DEFAULT_TIMEZONE must be a valid IANA timezone" },
      ),
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
      if (!data.AUTH_SECRET) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_SECRET"], message: "AUTH_SECRET is required in production" });
      } else if (data.AUTH_SECRET.length < 32) {
        // 16-char secrets allow offline JWT-HMAC brute force → session forgery.
        // Existing dev/test secrets are unaffected; only production enforces this.
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_SECRET"], message: "AUTH_SECRET must be at least 32 chars in production (openssl rand -hex 32)" });
      }
      if (!data.APP_URL) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["APP_URL"], message: "APP_URL is required in production (https://...)" });
    }
  });

export function parseEnv(schema: z.ZodType, raw: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  // ALLOW_PRIVATE_UPSTREAM disables the SSRF guard — it must never be on in
  // production, even if set accidentally. Checked against the RAW env (not
  // process.env) so programmatic/test callers are validated against what
  // they actually passed. Exception: the Playwright e2e harness runs a
  // production build against a localhost mock push service and sets E2E=1
  // explicitly — a deliberate two-flag acknowledgment, not an accident.
  const data = result.data as { NODE_ENV?: string };
  if (data?.NODE_ENV === "production" && (raw.ALLOW_PRIVATE_UPSTREAM ?? "") === "1" && (raw.E2E ?? "") !== "1") {
    throw new Error("Invalid environment:\n  ALLOW_PRIVATE_UPSTREAM: ALLOW_PRIVATE_UPSTREAM=1 is forbidden in production");
  }
  return result.data;
}