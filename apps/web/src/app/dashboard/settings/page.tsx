import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, backups, settings } from "@pushpanel/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { SettingsForm, SecretsForm, GDriveForm } from "./settings-form";
import { BackupsPanel } from "./settings-form";

export const metadata = { title: "Settings" };

const SETTING_KEYS = [
  "timezone",
  "cleanup_unsubs_retention_days",
  "sending_speed",
  "utm_enabled",
  "api_access_enabled",
  "backup_auto_interval",
  "backup_retention",
  "white_label",
  "cdn_url",
  "frequency_cap_daily",
  "suppression_enabled",
  "gdrive_enabled",
  "gdrive_folder_id",
  "secret:ai_api_key",
  "secret:ai_model",
  "secret:ai_base_url",
  "secret:mail_provider",
  "secret:mail_api_key",
  "secret:mail_from",
  "secret:gdrive_service_json",
] as const;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) return <p className="text-sm text-muted-foreground">Not signed in.</p>;

  const [settingsRows, backupList, auditRows] = await Promise.all([
    db.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key, [...SETTING_KEYS])).all(),
    db
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
      .all(),
    db
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
      .all(),
  ]);

  const valueOf = (key: (typeof SETTING_KEYS)[number]): string | undefined =>
    settingsRows.find((r) => r.key === key)?.value ?? undefined;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Panel-wide configuration and database backups.</p>
      </div>

      <SettingsForm
        timezone={valueOf("timezone") ?? ""}
        retentionDays={valueOf("cleanup_unsubs_retention_days") ?? "30"}
        sendingSpeed={valueOf("sending_speed") ?? "25"}
        utmEnabled={valueOf("utm_enabled") === "1"}
        apiAccess={valueOf("api_access_enabled") !== "0"}
        backupInterval={valueOf("backup_auto_interval") ?? "off"}
        backupRetention={valueOf("backup_retention") ?? "10"}
        whiteLabel={valueOf("white_label") === "1"}
        cdnUrl={valueOf("cdn_url") ?? ""}
        frequencyCapDaily={valueOf("frequency_cap_daily") ?? "3"}
        suppressionEnabled={valueOf("suppression_enabled") !== "0"}
      />

      <SecretsForm
        hasAiKey={!!valueOf("secret:ai_api_key")}
        aiModel={valueOf("secret:ai_model") ?? "gpt-4o-mini"}
        aiBaseUrl={valueOf("secret:ai_base_url") ?? "https://api.openai.com/v1"}
        mailProvider={valueOf("secret:mail_provider") ?? "resend"}
        hasMailKey={!!valueOf("secret:mail_api_key")}
        mailFrom={valueOf("secret:mail_from") ?? ""}
      />

      <GDriveForm
        enabled={valueOf("gdrive_enabled") === "1"}
        folderId={valueOf("gdrive_folder_id") ?? ""}
        hasServiceJson={!!valueOf("secret:gdrive_service_json")}
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
