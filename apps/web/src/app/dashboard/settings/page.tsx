import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, backups, settings } from "@pushpanel/db/schema";
import { desc, eq } from "drizzle-orm";
import { SettingsForm } from "./settings-form";
import { BackupsPanel } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return <p className="text-sm text-muted-foreground">Not signed in.</p>;

  const [timezoneRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "timezone")).limit(1).all();
  const [retentionRow] = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "cleanup_unsubs_retention_days"))
    .limit(1)
    .all();
  const [speedRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "sending_speed")).limit(1).all();
  const [utmRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "utm_enabled")).limit(1).all();
  const [backupIntervalRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "backup_auto_interval")).limit(1).all();
  const [backupRetentionRow] = db.select({ value: settings.value }).from(settings).where(eq(settings.key, "backup_retention")).limit(1).all();

  const backupList = await db
    .select({
      id: backups.id,
      kind: backups.kind,
      status: backups.status,
      size_bytes: backups.size_bytes,
      created_at: backups.created_at,
    })
    .from(backups)
    .orderBy(desc(backups.id))
    .limit(50)
    .all();

  const auditRows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity_type: auditLog.entity_type,
      entity_id: auditLog.entity_id,
      meta_json: auditLog.meta_json,
      ts: auditLog.ts,
    })
    .from(auditLog)
    .where(eq(auditLog.workspace_id, Number(session.user.workspaceId)))
    .orderBy(desc(auditLog.ts), desc(auditLog.id))
    .limit(20)
    .all();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Panel-wide configuration and database backups.</p>
      </div>

      <SettingsForm
        timezone={timezoneRow?.value ?? ""}
        retentionDays={retentionRow?.value ?? "30"}
        sendingSpeed={speedRow?.value ?? "25"}
        utmEnabled={utmRow?.value === "1"}
        backupInterval={backupIntervalRow?.value ?? "off"}
        backupRetention={backupRetentionRow?.value ?? "10"}
      />

      <BackupsPanel rows={backupList} />

      <section>
        <h2 className="text-lg font-semibold">Audit log</h2>
        <p className="mt-1 text-sm text-muted-foreground">Recent workspace activity.</p>
        <ul className="mt-3 space-y-1.5">
          {auditRows.length === 0 && (
            <li className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No activity yet.
            </li>
          )}
          {auditRows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.action}</code>
              {row.entity_type && (
                <span className="text-muted-foreground">
                  {row.entity_type}
                  {row.entity_id ? ` #${row.entity_id}` : ""}
                </span>
              )}
              {row.meta_json && <span className="truncate text-muted-foreground">{row.meta_json}</span>}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {new Date(row.ts).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        <Link href="/dashboard/profile" className="hover:underline">
          Manage profile →
        </Link>
      </p>
    </div>
  );
}
