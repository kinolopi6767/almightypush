"use server";

import { chmod, mkdir, stat, unlink, writeFile as writeFileProm } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { resolveDbPath, backupDatabase, closeDb, DB_REPLACED_MARKER } from "@pushpanel/db";
import { backups, settings } from "@pushpanel/db/schema";
import { desc, eq, sql } from "drizzle-orm";
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

/**
 * Settings/secrets/backups are INSTANCE-global (no workspace scoping in the
 * settings table, and restore replaces the entire DB). They are reserved for
 * the bootstrap instance owner — not merely any user with role "owner" from
 * a team invite, who could otherwise read other workspaces' data or restore
 * a backup over them.
 */
async function requireOwner() {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in");
  if (session.user.role !== "owner" || !session.user.isInstanceOwner) {
    throw new Error("Instance owner access required");
  }
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
  cdnUrl: z.string().trim().max(500).pipe(z.string().refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")).optional().or(z.literal("")),
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

  // FormData quirk: a cleared numeric input submits "" — z.coerce.number()
  // turns "" into 0, silently zeroing retention/speed caps. "" means "keep".
  const numOrUndef = (v: FormDataEntryValue | null) => (v === "" || v === null ? undefined : v);
  const parsed = generalSchema.safeParse({
    timezone: formData.get("timezone") ?? undefined,
    cleanupRetentionDays: numOrUndef(formData.get("cleanupRetentionDays")),
    sendingSpeed: numOrUndef(formData.get("sendingSpeed")),
    utmEnabled: formData.get("utmEnabled") ?? "off",
    // Checkbox quirk: an unchecked box submits no field — that IS the "off" state.
    apiAccess: formData.get("apiAccess") ?? "off",
    backupInterval: formData.get("backupInterval") ?? "off",
    backupRetention: numOrUndef(formData.get("backupRetention")),
    whiteLabel: formData.get("whiteLabel") ?? "off",
    cdnUrl: formData.get("cdnUrl") ?? "",
    frequencyCapDaily: numOrUndef(formData.get("frequencyCapDaily")),
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

  // Record WHICH settings changed (values may be sensitive) so the audit
  // trail can answer "who turned X on/off" without a value dump.
  if (workspaceId) logAudit(db, { workspaceId, action: "settings.update", meta: { keys: values.map((v) => v.key) } });
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
  ai_base_url: z.string().max(500).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL").optional().or(z.literal("")),
  ydc_api_key: z.string().max(500).optional().or(z.literal("")),
  mail_provider: z.enum(["resend", "brevo", "ses", "smtp", ""]).optional().or(z.literal("")),
  mail_api_key: z.string().max(500).optional().or(z.literal("")),
  mail_from: z.string().email().max(200).optional().or(z.literal("")),
  // Explicit clear checkboxes — blank input alone means "keep existing".
  clear_ai_api_key: z.enum(["on"]).optional(),
  clear_ydc_api_key: z.enum(["on"]).optional(),
  clear_mail_api_key: z.enum(["on"]).optional(),
  clear_ai_model: z.enum(["on"]).optional(),
  clear_ai_base_url: z.enum(["on"]).optional(),
  clear_mail_provider: z.enum(["on"]).optional(),
  clear_mail_from: z.enum(["on"]).optional(),
});

export async function updateSecretsAction(_prev: SettingsFormState, formData: FormData): Promise<NonNullable<SettingsFormState>> {
  let secretsWorkspaceId = 0;
  try {
    const ownerSession = await requireOwner();
    secretsWorkspaceId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;
  } catch {
    return { error: "Not signed in or not an owner" };
  }
  const parsed = secretsSchema.safeParse({
    ai_api_key: formData.get("ai_api_key") ?? "",
    ai_model: formData.get("ai_model") ?? "",
    ai_base_url: formData.get("ai_base_url") ?? "",
    ydc_api_key: formData.get("ydc_api_key") ?? "",
    mail_provider: formData.get("mail_provider") ?? "",
    mail_api_key: formData.get("mail_api_key") ?? "",
    mail_from: formData.get("mail_from") ?? "",
    clear_ai_api_key: formData.get("clear_ai_api_key") ?? undefined,
    clear_ydc_api_key: formData.get("clear_ydc_api_key") ?? undefined,
    clear_mail_api_key: formData.get("clear_mail_api_key") ?? undefined,
    clear_ai_model: formData.get("clear_ai_model") ?? undefined,
    clear_ai_base_url: formData.get("clear_ai_base_url") ?? undefined,
    clear_mail_provider: formData.get("clear_mail_provider") ?? undefined,
    clear_mail_from: formData.get("clear_mail_from") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  // The UI promises "leave blank to keep the existing value" — empty fields
  // must be skipped, not treated as deletion. Deletion is explicit via the
  // per-key "Clear" checkbox; a pasted replacement value always wins.
  const saveOrClear = (key: string, value: string | undefined, clear: "on" | undefined) => {
    if (value) setSecret(key, value);
    else if (clear === "on") setSecret(key, null);
  };
  saveOrClear("ai_api_key", d.ai_api_key, d.clear_ai_api_key);
  saveOrClear("ai_model", d.ai_model, d.clear_ai_model);
  saveOrClear("ai_base_url", d.ai_base_url, d.clear_ai_base_url);
  saveOrClear("ydc_api_key", d.ydc_api_key, d.clear_ydc_api_key);
  saveOrClear("mail_provider", d.mail_provider, d.clear_mail_provider);
  saveOrClear("mail_api_key", d.mail_api_key, d.clear_mail_api_key);
  saveOrClear("mail_from", d.mail_from, d.clear_mail_from);
  // Secret rotation is security-relevant; record which keys changed (never values).
  if (secretsWorkspaceId) {
    logAudit(db, {
      workspaceId: secretsWorkspaceId,
      action: "secret.update",
      entityType: "settings",
      meta: {
        ai_api_key: Boolean(d.ai_api_key || d.clear_ai_api_key),
        ydc_api_key: Boolean(d.ydc_api_key || d.clear_ydc_api_key),
        mail_api_key: Boolean(d.mail_api_key || d.clear_mail_api_key),
        ai_model: Boolean(d.ai_model),
        ai_base_url: Boolean(d.ai_base_url),
        mail_provider: Boolean(d.mail_provider),
        mail_from: Boolean(d.mail_from),
      },
    });
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const gdriveSchema = z.object({
  gdrive_enabled: z.enum(["on", "off"]).optional(),
  gdrive_folder_id: z.string().max(200).optional().or(z.literal("")),
  gdrive_service_json: z.string().max(20000).optional().or(z.literal("")),
});

export async function updateGDriveAction(_prev: SettingsFormState, formData: FormData): Promise<NonNullable<SettingsFormState>> {
  let gdriveWorkspaceId = 0;
  try {
    const ownerSession = await requireOwner();
    gdriveWorkspaceId = ownerSession.user.workspaceId ? Number(ownerSession.user.workspaceId) : 0;
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
  if (gdriveWorkspaceId) {
    logAudit(db, {
      workspaceId: gdriveWorkspaceId,
      action: "secret.update",
      entityType: "settings",
      meta: { gdrive_enabled: d.gdrive_enabled === "on", service_json: Boolean(d.gdrive_service_json) },
    });
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
  // Random suffix (mirrors the worker snapshot path): two backups in the same
  // millisecond must not share a filename.
  const target = path.join(backupDir, `backup-manual-${stamp}-${randomBytes(4).toString("hex")}.db`);

  try {
    // Non-blocking consistent snapshot (better-sqlite3 backup API) — a sync
    // VACUUM INTO would stall every concurrent request for the whole copy.
    await backupDatabase(db, target);
    // Snapshots contain password hashes + encrypted tokens — owner-only reads.
    await chmod(target, 0o600).catch(() => undefined);
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
  // Manual backups previously grew unbounded (the worker only prunes after
  // auto snapshots) — enforce the same retention here so the backups dir
  // can't fill the disk one click at a time.
  try {
    const retentionRaw = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "backup_retention")).get()?.value;
    const retentionParsed = Number(retentionRaw ?? 10);
    const retention = Number.isFinite(retentionParsed) ? Math.min(Math.max(Math.floor(retentionParsed), 1), 365) : 10;
    const manualRows = db
      .select({ id: backups.id, location: backups.location })
      .from(backups)
      .where(eq(backups.kind, "manual"))
      .orderBy(desc(backups.id))
      .all();
    for (const stale of manualRows.slice(retention)) {
      db.delete(backups).where(eq(backups.id, stale.id)).run();
      if (stale.location) {
        try {
          await unlink(stale.location);
        } catch {
          // file may already be gone — row removal is what matters
        }
      }
    }
  } catch {
    // pruning is hygiene, never fail the backup over it
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
    // Constrain the unlink to the backups dir: the location comes from the
    // DB, and a tampered row must not become an arbitrary-file-delete.
    try {
      const dbFile = resolveDbPath(process.env.DATABASE_PATH);
      const allowedDir = path.resolve(path.dirname(dbFile), "backups");
      const resolved = path.resolve(row.location);
      if (resolved === allowedDir || resolved.startsWith(allowedDir + path.sep)) {
        await unlink(row.location);
      }
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
    // Validate before touching the live DB: a corrupt/truncated backup must
    // never replace a working database. SQLite files start with a 16-byte magic.
    if (data.length < 100 || data.subarray(0, 16).toString("binary") !== "SQLite format 3\0") {
      return { error: "Restore failed: backup file is not a valid SQLite database" };
    }
    const { rename, unlink: unlinkSync } = await import("node:fs/promises");
    // Checkpoint the live DB so no WAL frames survive the swap, then
    // overwrite the current DB file (WAL will be checkpointed on next open).
    try {
      db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
    } catch {
      // best effort — the -wal/-shm removal below is the real guard
    }
    // Atomic swap: write to a temp sibling + fsync + integrity_check the COPY,
    // then rename over the live file. A crash mid-write leaves the old DB
    // intact instead of a truncated live file (previous code wrote in place).
    const tmpFile = `${dbFile}.restore-${randomBytes(4).toString("hex")}.tmp`;
    try {
      const { open } = await import("node:fs/promises");
      const fh = await open(tmpFile, "w");
      try {
        await fh.writeFile(data);
        await fh.sync();
      } finally {
        await fh.close();
      }
      const Database = (await import("better-sqlite3")).default;
      let integrity = "";
      try {
        // read-only open: the check itself cannot mutate the candidate.
        const probe = new Database(tmpFile, { readonly: true });
        try {
          const prow = probe.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
          integrity = String(prow?.integrity_check ?? "").toLowerCase();
        } finally {
          probe.close();
        }
      } catch {
        integrity = "error";
      }
      if (integrity !== "ok") {
        try { await unlinkSync(tmpFile); } catch { /* best-effort */ }
        return { error: "Restore failed: backup file failed SQLite integrity check" };
      }
      await rename(tmpFile, dbFile);
    } catch (e) {
      try { await unlinkSync(tmpFile); } catch { /* best-effort */ }
      throw e;
    }
    // VACUUM INTO creates a single self-contained file. The live DB's stale
    // -wal/-shm files would corrupt the restored data on next open — remove them.
    for (const suffix of ["-wal", "-shm"]) {
      try { await unlinkSync(dbFile + suffix); } catch { /* may not exist */ }
    }
    // Audit BEFORE healing the connection: closeDb() invalidates this
    // process's handle, so logging after it would insert through a stale
    // connection paging the pre-swap file.
    if (wsId) logAudit(db, { workspaceId: wsId, action: "backup.restore", entityType: "backup", entityId: backupId, meta: { restored: 1 } });
    // Connection healing (no restart needed): this process's open connection
    // still pages the OLD file — close it so the next request reopens the
    // restored one. The worker heals itself the same way via the marker file
    // it checks every tick (see apps/worker/src/index.ts).
    try {
      closeDb();
    } catch {
      // reopen happens lazily anyway — a stale cache clear is best-effort
    }
    try {
      await writeFileProm(path.join(path.dirname(dbFile), DB_REPLACED_MARKER), new Date().toISOString());
    } catch {
      // worker restart covers a missed marker — never fail the restore over it
    }
  } catch (e) {
    return { error: `Restore failed: ${(e as Error).message}` };
  }
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const outboundSchema = z.object({
  outbound_webhook_url: z.string().max(500).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL").optional().or(z.literal("")),
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
      // Premium SSRF hardening: webhooks must be https and public.
      // Static hostname block (fail fast at save) + dispatcher re-validation
      // at send time (covers DNS rebinding). Static check covers literals +
      // well-known private ranges; the dispatcher covers resolved IPs.
      const u = new URL(d.outbound_webhook_url);
      if (u.protocol !== "https:") {
        return { error: "Webhook URL must use https://" };
      }
      const host = u.hostname.toLowerCase();
      const blocked =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "0.0.0.0" ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".localhost") ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^0x7f\./i.test(host) ||
        host === "2130706433" ||
        host.startsWith("::ffff:") ||
        host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80:");
      if (blocked) {
        return { error: "Webhook URL must be a public host (no localhost/private)" };
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
