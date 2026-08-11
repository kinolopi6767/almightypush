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
import { isValidTimezone } from "@pushpanel/core";
import { logAudit } from "@/lib/audit";

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
  cleanupRetentionDays: z.coerce.number().int().min(0).max(3650).optional(),
  sendingSpeed: z.coerce.number().int().min(1).max(200).optional(),
  utmEnabled: z.enum(["on", "off"]).optional(),
  backupInterval: z.enum(["off", "daily", "weekly", "monthly"]).optional(),
  backupRetention: z.coerce.number().int().min(1).max(60).optional(),
});

export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<NonNullable<SettingsFormState>> {
  try {
    await requireOwner();
  } catch {
    return { error: "Not signed in" };
  }

  const parsed = generalSchema.safeParse({
    timezone: formData.get("timezone") ?? undefined,
    cleanupRetentionDays: formData.get("cleanupRetentionDays") ?? undefined,
    sendingSpeed: formData.get("sendingSpeed") ?? undefined,
    utmEnabled: formData.get("utmEnabled") ?? "off",
    backupInterval: formData.get("backupInterval") ?? "off",
    backupRetention: formData.get("backupRetention") ?? undefined,
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
  if (parsed.data.backupInterval !== undefined) {
    values.push({ key: "backup_auto_interval", value: parsed.data.backupInterval });
  }
  if (parsed.data.backupRetention !== undefined) {
    values.push({ key: "backup_retention", value: String(parsed.data.backupRetention) });
  }

  const owner = await requireOwner().catch(() => null);
  const workspaceId = owner ? Number(owner.user.workspaceId) : 0;

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

export async function createBackupAction(): Promise<NonNullable<SettingsFormState>> {
  try {
    await requireOwner();
  } catch {
    return { error: "Not signed in" };
  }

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

  const owner = await requireOwner().catch(() => null);
  const wsId = owner ? Number(owner.user.workspaceId) : 0;
  if (wsId) {
    logAudit(db, { workspaceId: wsId, action: "backup.create", entityType: "backup", entityId: Number(inserted.lastInsertRowid), meta: { kind: "manual" } });
  }
  revalidatePath("/dashboard/settings");
  return { ok: true, backupId: Number(inserted.lastInsertRowid) };
}

export async function deleteBackupAction(backupId: number): Promise<NonNullable<SettingsFormState>> {
  try {
    await requireOwner();
  } catch {
    return { error: "Not signed in" };
  }

  const [row] = db.select({ id: backups.id, location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row) return { error: "Backup not found" };

  db.delete(backups).where(eq(backups.id, row.id)).run();
  const owner2 = await requireOwner().catch(() => null);
  const wsId2 = owner2 ? Number(owner2.user.workspaceId) : 0;
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
