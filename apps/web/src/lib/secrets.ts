import { createCipher } from "@pushpanel/core";
import { db } from "@/lib/db";
import { settings } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";

/**
 * Panel-managed secrets vault — single-person private use.
 * All API keys (AI, Mail, Drive, etc.) live encrypted in `settings` via APP_ENC_KEY,
 * editable in /dashboard/settings — no .env hassle. Env remains fallback for 12-factor.
 */

function cipher() {
  const k = process.env.APP_ENC_KEY;
  if (!k) throw new Error("APP_ENC_KEY required to decrypt panel secrets");
  return createCipher(k);
}

export function setSecret(key: string, plain: string | null): void {
  // key example: "ai_api_key", "gdrive_service_json"
  const dbKey = `secret:${key}`;
  if (plain === null || plain === "") {
    db.delete(settings).where(eq(settings.key, dbKey)).run();
    return;
  }
  const enc = cipher().encrypt(plain);
  db.insert(settings).values({ key: dbKey, value: enc }).onConflictDoUpdate({ target: settings.key, set: { value: enc } }).run();
}

export function getSecret(key: string): string | null {
  const dbKey = `secret:${key}`;
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, dbKey)).get();
  if (!row?.value) return null;
  try {
    return cipher().decrypt(row.value);
  } catch {
    return null;
  }
}

/**
 * Env wins if set (for Docker/Coolify 12-factor), otherwise panel secret.
 * Pass envName explicitly so we don't leak key mapping.
 */
export function getSecretWithEnvFallback(panelKey: string, envName: string): string | null {
  const envVal = process.env[envName];
  if (envVal && envVal.trim() !== "") return envVal;
  return getSecret(panelKey);
}

// Typed helpers for the 3 providers we ship

export function getAiConfig(): { apiKey: string | null; model: string; baseUrl: string } {
  return {
    apiKey: getSecretWithEnvFallback("ai_api_key", "AI_API_KEY"),
    model: getSecretWithEnvFallback("ai_model", "AI_MODEL") ?? "gpt-4o-mini",
    baseUrl: getSecretWithEnvFallback("ai_base_url", "AI_BASE_URL") ?? "https://api.openai.com/v1",
  };
}

export function getMailConfig(): { provider: string; apiKey: string | null; from: string | null } {
  return {
    provider: getSecretWithEnvFallback("mail_provider", "MAIL_PROVIDER") ?? "resend",
    apiKey: getSecretWithEnvFallback("mail_api_key", "MAIL_API_KEY") ?? getSecretWithEnvFallback("resend_api_key", "RESEND_API_KEY"),
    from: getSecretWithEnvFallback("mail_from", "MAIL_FROM"),
  };
}

export function getGDriveConfig(): { enabled: boolean; folderId: string | null; serviceJson: string | null } {
  const enabled = (db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_enabled")).get()?.value ?? "0") === "1";
  const folderId = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_folder_id")).get()?.value ?? null;
  const serviceJson = getSecretWithEnvFallback("gdrive_service_json", "GDRIVE_SERVICE_JSON");
  return { enabled, folderId, serviceJson };
}

export function getYouConfig(): { apiKey: string | null } {
  return { apiKey: getSecretWithEnvFallback("ydc_api_key", "YDC_API_KEY") ?? getSecretWithEnvFallback("ydc_api_key", "YOU_API_KEY") };
}
