import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { createCipher, emitWebhookEvent, type OutboundWebhookConfig } from "@pushpanel/core";
import { settings, type allTables } from "@pushpanel/db";

type PushDb = BetterSQLite3Database<typeof allTables>;

/** Read the owner-configured outbound webhook from settings (sync gets). */
export function getOutboundConfig(db: PushDb): OutboundWebhookConfig | null {
  const url = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "outbound_webhook_url")).get()?.value;
  if (!url) return null;
  let secret: string | null = null;
  const enc = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "secret:outbound_webhook_secret")).get()?.value;
  if (enc) {
    try {
      secret = createCipher(process.env.APP_ENC_KEY).decrypt(enc);
    } catch {
      // Fail CLOSED: a receiver verifying HMAC would silently drop unsigned
      // events. A broken vault key must disable emission, not downgrade it.
      return null;
    }
  }
  return { url, secret };
}

/** Fire-and-forget lifecycle event to the configured webhook (no-op when unset). */
export function emitEvent(db: PushDb, event: string, data: Record<string, unknown>): void {
  const config = getOutboundConfig(db);
  if (config) emitWebhookEvent(config, event, data);
}
