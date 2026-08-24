"use server";

import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resolveDbPath } from "@pushpanel/db";
import { backups, settings } from "@pushpanel/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createCipher, isValidTimezone } from "@pushpanel/core";
import { logAudit } from "@/lib/audit";
import { readFile } from "node:fs/promises";
import { getGDriveAccessToken, uploadToGDrive } from "@pushpanel/core";

export type SettingsFormState =
  | {
      ok?: boolean;
      error?: string;
      backupId?: number;
      deleted?: number;
    }
  | undefined;

async function requireOwner() {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in");
  if (session.user.role !== "owner") throw new Error("Owner access required");
  return session;
}

const generalSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((v) => isValidTimezone(v), { message: "Unknown timezone — pick one from the list" })
    .optional(),
  cleanupRetentionDays: z.coerce.number().int().min(0).max(36500).optional(), // personal: effectively unlimited (was 3650)
  sendingSpeed: z.coerce.number().int().min(1).max(1000).optional(), // unlocked from 200 for personal
  utmEnabled: z.enum(["on", "off"]).optional(),
  apiAccess: z.enum(["on", "off"]).optional(),
  backupInterval: z.enum(["off", "daily", "weekly", "monthly"]).optional(),
  backupRetention: z.coerce.number().int().min(1).max(365).optional(), // unlocked from 60
  whiteLabel: z.enum(["on", "off"]).optional(),
  cdnUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  frequencyCapDaily: z.coerce.number().int().min(0).max(1000).optional(), // unlocked from 100
  suppressionEnabled: z.enum(["on", "off"]).optional(),
});

export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<NonNullable<SettingsFormState>> {
  let ownerSession;
  try {
    ownerSession = await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const workspaceId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;

  const parsed = generalSchema.safeParse({
    timezone: formData.get("timezone") ?? undefined,
    cleanupRetentionDays: formData.get("cleanupRetentionDays") ?? undefined,
    sendingSpeed: formData.get("sendingSpeed") ?? undefined,
    utmEnabled: formData.get("utmEnabled") ?? "off",
    // Checkbox quirk: an unchecked box submits no field — that IS the "off" state.
    apiAccess: formData.get("apiAccess") ?? "off",
    backupInterval: formData.get("backupInterval") ?? "off",
    backupRetention: formData.get("backupRetention") ?? undefined,
    whiteLabel: formData.get("whiteLabel") ?? "off",
    cdnUrl: formData.get("cdnUrl") ?? "",
    frequencyCapDaily: formData.get("frequencyCapDaily") ?? undefined,
    suppressionEnabled: formData.get("suppressionEnabled") ?? "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const values: { key: string; value: string }[] = [];
  if (parsed.data.timezone !== undefined) values.push({ key: "timezone", value: parsed.data.timezone });
  if (parsed.data.cleanupRetentionDays !== undefined) {
    values.push({ key: "cleanup_unsubs_retention_days", value: String(parsed.data.cleanupRetentionDays) });
  }
  if (parsed.data.sendingSpeed !== undefined) {
    values.push({ key: "sending_speed", value: String(parsed.data.sendingSpeed) });
  }
  values.push({ key: "utm_enabled", value: parsed.data.utmEnabled === "off" ? "0" : "1" });
  values.push({ key: "api_access_enabled", value: parsed.data.apiAccess === "off" ? "0" : "1" });
  if (parsed.data.backupInterval !== undefined) {
    values.push({ key: "backup_auto_interval", value: parsed.data.backupInterval });
  }
  if (parsed.data.backupRetention !== undefined) {
    values.push({ key: "backup_retention", value: String(parsed.data.backupRetention) });
  }
  values.push({ key: "white_label", value: parsed.data.whiteLabel === "off" ? "0" : "1" });
  if (parsed.data.cdnUrl !== undefined) values.push({ key: "cdn_url", value: parsed.data.cdnUrl || "" });
  if (parsed.data.frequencyCapDaily !== undefined) values.push({ key: "frequency_cap_daily", value: String(parsed.data.frequencyCapDaily) });
  values.push({ key: "suppression_enabled", value: parsed.data.suppressionEnabled === "off" ? "0" : "1" });

  for (const v of values) {
    db.insert(settings)
      .values(v)
      .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } })
      .run();
  }

  if (workspaceId) logAudit(db, { workspaceId, action: "settings.update" });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

// ── Panel-managed secrets vault (single-person private: no .env hassle) ──

function requireEncKey(): string {
  const k = process.env.APP_ENC_KEY;
  if (!k) throw new Error("APP_ENC_KEY required");
  return k;
}

function setSecret(key: string, plain: string | null) {
  const dbKey = `secret:${key}`;
  if (plain === null || plain.trim() === "") {
    db.delete(settings).where(eq(settings.key, dbKey)).run();
    return;
  }
  const enc = createCipher(requireEncKey()).encrypt(plain.trim());
  db.insert(settings).values({ key: dbKey, value: enc }).onConflictDoUpdate({ target: settings.key, set: { value: enc } }).run();
}

const secretsSchema = z.object({
  ai_api_key: z.string().max(500).optional().or(z.literal("")),
  ai_model: z.string().max(100).optional().or(z.literal("")),
  ai_base_url: z.string().url().max(500).optional().or(z.literal("")),
  mail_provider: z.enum(["resend", "brevo", "ses", "smtp", ""]).optional().or(z.literal("")),
  mail_api_key: z.string().max(500).optional().or(z.literal("")),
  mail_from: z.string().email().max(200).optional().or(z.literal("")),
});

export async function updateSecretsAction(_prev: SettingsFormState, formData: FormData): Promise<NonNullable<SettingsFormState>> {
  try {
    await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const parsed = secretsSchema.safeParse({
    ai_api_key: formData.get("ai_api_key") ?? "",
    ai_model: formData.get("ai_model") ?? "",
    ai_base_url: formData.get("ai_base_url") ?? "",
    mail_provider: formData.get("mail_provider") ?? "",
    mail_api_key: formData.get("mail_api_key") ?? "",
    mail_from: formData.get("mail_from") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  // The UI promises "leave blank to keep the existing value" — empty fields
  // must be skipped, not treated as deletion.
  if (d.ai_api_key) setSecret("ai_api_key", d.ai_api_key);
  if (d.ai_model) setSecret("ai_model", d.ai_model);
  if (d.ai_base_url) setSecret("ai_base_url", d.ai_base_url);
  if (d.mail_provider) setSecret("mail_provider", d.mail_provider);
  if (d.mail_api_key) setSecret("mail_api_key", d.mail_api_key);
  if (d.mail_from) setSecret("mail_from", d.mail_from);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const gdriveSchema = z.object({
  gdrive_enabled: z.enum(["on", "off"]).optional(),
  gdrive_folder_id: z.string().max(200).optional().or(z.literal("")),
  gdrive_service_json: z.string().max(20000).optional().or(z.literal("")),
});

export async function updateGDriveAction(_prev: SettingsFormState, formData: FormData): Promise<NonNullable<SettingsFormState>> {
  try {
    await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const parsed = gdriveSchema.safeParse({
    gdrive_enabled: formData.get("gdrive_enabled") ?? "off",
    gdrive_folder_id: formData.get("gdrive_folder_id") ?? "",
    gdrive_service_json: formData.get("gdrive_service_json") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  db.insert(settings).values({ key: "gdrive_enabled", value: d.gdrive_enabled === "on" ? "1" : "0" }).onConflictDoUpdate({ target: settings.key, set: { value: d.gdrive_enabled === "on" ? "1" : "0" } }).run();
  db.insert(settings).values({ key: "gdrive_folder_id", value: d.gdrive_folder_id || "" }).onConflictDoUpdate({ target: settings.key, set: { value: d.gdrive_folder_id || "" } }).run();
  if (d.gdrive_service_json) {
    try {
      const j = JSON.parse(d.gdrive_service_json);
      if (!j.client_email || !j.private_key) return { error: "Invalid Service Account JSON: missing client_email/private_key" };
    } catch {
      return { error: "Invalid JSON for Service Account" };
    }
    setSecret("gdrive_service_json", d.gdrive_service_json);
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

async function tryUploadBackupToDrive(filePath: string): Promise<void> {
  const enabled = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_enabled")).get()?.value === "1";
  if (!enabled) return;
  const enc = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "secret:gdrive_service_json")).get()?.value;
  if (!enc) return;
  let json: string;
  try {
    json = createCipher(requireEncKey()).decrypt(enc);
  } catch {
    return;
  }
  const folderId = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "gdrive_folder_id")).get()?.value || undefined;
  try {
    const buf = await readFile(filePath);
    const token = await getGDriveAccessToken(json);
    await uploadToGDrive({ accessToken: token, fileName: filePath.split("/").pop() ?? "backup.db", fileBuffer: buf, folderId });
  } catch (e) {
    console.error("[gdrive] upload failed", (e as Error).message?.slice(0, 500));
  }
}

export async function createBackupAction(): Promise<NonNullable<SettingsFormState>> {
  let ownerSession;
  try {
    ownerSession = await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const wsId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;

  const dbFile = resolveDbPath(process.env.DATABASE_PATH);
  const backupDir = path.join(path.dirname(dbFile), "backups");
  await mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `backup-${stamp}.db`);

  try {
    // SQLite literal path — escape single quotes
    db.run(sql.raw(`VACUUM INTO '${target.replace(/'/g, "''")}'`));
  } catch (err) {
    return { error: `Backup failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  let size = 0;
  try {
    size = (await stat(target)).size;
  } catch {
    return { error: "Backup file missing after creation" };
  }

  const inserted = db
    .insert(backups)
    .values({
      kind: "manual",
      status: "done",
      size_bytes: size,
      location: target,
    })
    .run();

  if (wsId) {
    logAudit(db, { workspaceId: wsId, action: "backup.create", entityType: "backup", entityId: Number(inserted.lastInsertRowid), meta: { kind: "manual" } });
  }
  // best-effort Drive upload (disabled by default)
  void tryUploadBackupToDrive(target).catch(() => {});
  revalidatePath("/dashboard/settings");
  return { ok: true, backupId: Number(inserted.lastInsertRowid) };
}

export async function deleteBackupAction(backupId: number): Promise<NonNullable<SettingsFormState>> {
  let ownerSession;
  try {
    ownerSession = await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const wsId2 = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;

  const [row] = db.select({ id: backups.id, location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row) return { error: "Backup not found" };

  db.delete(backups).where(eq(backups.id, row.id)).run();
  if (wsId2) {
    logAudit(db, { workspaceId: wsId2, action: "backup.delete", entityType: "backup", entityId: backupId });
  }
  if (row.location) {
    try {
      await unlink(row.location);
    } catch {
      // file may already be gone — row removal is what matters
    }
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, deleted: backupId };
}

export async function restoreBackupAction(backupId: number): Promise<NonNullable<SettingsFormState>> {
  let ownerSession;
  try {
    ownerSession = await requireOwner();
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const wsId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;
  const [row] = db.select({ id: backups.id, location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row?.location) return { error: "Backup not found" };
  const dbFile = resolveDbPath(process.env.DATABASE_PATH);
  try {
    const data = await readFile(row.location);
    const { writeFile } = await import("node:fs/promises");
    // SQLite restore: overwrite current DB file (WAL will be checkpointed on next open)
    await writeFile(dbFile, data);
    // VACUUM INTO creates a single self-contained file. The live DB's stale
    // -wal/-shm files would corrupt the restored data on next open — remove them.
    const { unlink: unlinkSync } = await import("node:fs/promises");
    for (const suffix of ["-wal", "-shm"]) {
      try { await unlinkSync(dbFile + suffix); } catch { /* may not exist */ }
    }
    if (wsId) logAudit(db, { workspaceId: wsId, action: "backup.create", entityType: "backup", entityId: backupId, meta: { restored: 1 } });
  } catch (e) {
    return { error: `Restore failed: ${(e as Error).message}` };
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const outboundSchema = z.object({
  outbound_webhook_url: z.string().url().max(500).optional().or(z.literal("")),
  outbound_webhook_secret: z.string().max(200).optional().or(z.literal("")),
});

/**
 * Outbound event webhooks (n8n/Zapier/custom): POSTs HMAC-signed JSON on
 * subscribed / unsubscribed / clicked / campaign_done events.
 */
export async function updateOutboundAction(_prev: SettingsFormState, formData: FormData): Promise<NonNullable<SettingsFormState>> {
  let workspaceId: number | null = null;
  try {
    const ownerSession = await requireOwner();
    workspaceId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : null;
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const parsed = outboundSchema.safeParse({
    outbound_webhook_url: formData.get("outbound_webhook_url") ?? "",
    outbound_webhook_secret: formData.get("outbound_webhook_secret") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  if (d.outbound_webhook_url) {
    try {
      // Validate scheme — webhooks must be https in production.
      const u = new URL(d.outbound_webhook_url);
      if (u.protocol !== "https:") {
        return { error: "Webhook URL must use https://" };
      }
    } catch {
      return { error: "Invalid webhook URL" };
    }
    db.insert(settings).values({ key: "outbound_webhook_url", value: d.outbound_webhook_url }).onConflictDoUpdate({ target: settings.key, set: { value: d.outbound_webhook_url } }).run();
  } else {
    db.delete(settings).where(eq(settings.key, "outbound_webhook_url")).run();
    // No URL → no use for the signing secret; don't leave it in the vault.
    db.delete(settings).where(eq(settings.key, "secret:outbound_webhook_secret")).run();
  }
  if (d.outbound_webhook_secret) setSecret("outbound_webhook_secret", d.outbound_webhook_secret);
  if (workspaceId) {
    logAudit(db, { workspaceId, action: "settings.update", entityType: "settings", meta: { outbound_webhook_url: d.outbound_webhook_url ? "set" : "cleared", secret_rotated: Boolean(d.outbound_webhook_secret) } });
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
