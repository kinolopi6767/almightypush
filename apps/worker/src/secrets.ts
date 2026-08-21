import { createCipher } from "@pushpanel/core";
import { settings } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import type { allTables } from "@pushpanel/db/schema";

type PushDb = BetterSQLite3Database<typeof allTables>;

function cipher() {
  const k = process.env.APP_ENC_KEY;
  if (!k) throw new Error("APP_ENC_KEY required");
  return createCipher(k);
}

export function getSecret(db: PushDb, key: string): string | null {
  const dbKey = `secret:${key}`;
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, dbKey)).get();
  if (!row?.value) return null;
  try {
    return cipher().decrypt(row.value);
  } catch {
    return null;
  }
}

export function getSecretWithEnvFallback(db: PushDb, panelKey: string, envName: string): string | null {
  const envVal = process.env[envName];
  if (envVal && envVal.trim() !== "") return envVal;
  return getSecret(db, panelKey);
}

export function getGDriveConfig(db: PushDb): { enabled: boolean; folderId: string | null; serviceJson: string | null } {
  const enabled = (db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_enabled")).get()?.value ?? "0") === "1";
  const folderId = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_folder_id")).get()?.value ?? null;
  const serviceJson = getSecret(db, "gdrive_service_json") ?? process.env.GDRIVE_SERVICE_JSON ?? null;
  return { enabled, folderId, serviceJson };
}
