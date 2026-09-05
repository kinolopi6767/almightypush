import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, backups, settings } from "@pushpanel/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { SettingsForm, SecretsForm, GDriveForm, OutboundWebhookForm } from "./settings-form";
import { BackupsPanel } from "./settings-form";
import { PageHeader } from "@/components/page-header";
import { getAiConfig, getMailConfig } from "@/lib/secrets";

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
  "outbound_webhook_url",
  "secret:outbound_webhook_secret",
  "secret:ai_api_key",
  "secret:mail_api_key",
  "secret:ydc_api_key",
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

  // Non-sensitive AI/mail display fields are decrypted server-side — raw
  // `secret:*` ciphertext must never reach the browser (it would leak vault
  // material into the RSC payload and render garbage in the form).
  const aiConfig = getAiConfig();
  const mailConfig = getMailConfig();

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Panel-wide configuration and database backups." />

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
        hasYdcKey={!!valueOf("secret:ydc_api_key")}
        aiModel={aiConfig.model}
        aiBaseUrl={aiConfig.baseUrl}
        mailProvider={mailConfig.provider}
        hasMailKey={!!valueOf("secret:mail_api_key")}
        mailFrom={mailConfig.from ?? ""}
      />

      <GDriveForm
        enabled={valueOf("gdrive_enabled") === "1"}
        folderId={valueOf("gdrive_folder_id") ?? ""}
        hasServiceJson={!!valueOf("secret:gdrive_service_json")}
      />

      <OutboundWebhookForm url={valueOf("outbound_webhook_url") ?? ""} hasSecret={!!valueOf("secret:outbound_webhook_secret")} />

      <BackupsPanel rows={backupList} />

      <section className="premium-card rounded-xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Audit log — enterprise trail</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recent workspace activity · structured, searchable, exportable.</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/15">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> {auditRows.length} events
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border">
          <div className="max-h-[380px] overflow-y-auto premium-scroll">
            {auditRows.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5" aria-hidden><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
                </div>
                <p className="mt-3 text-sm font-medium">No activity yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Actions like campaign creation, domain setup, and backups will appear here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {auditRows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors">
                    <code className="shrink-0 rounded-lg bg-muted px-2 py-1 font-mono text-xs font-medium border">{row.action}</code>
                    {row.entity_type && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs text-muted-foreground shadow-xs">
                        {row.entity_type}
                        {row.entity_id ? ` #${row.entity_id}` : ""}
                      </span>
                    )}
                    {row.meta_json && <span className="hidden lg:block truncate text-xs text-muted-foreground max-w-[320px]">{row.meta_json}</span>}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                      {new Date(row.ts).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {auditRows.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing latest 20 · full history in database</span>
            <span className="font-mono">audit_log · {auditRows.length} rows</span>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        <Link href="/dashboard/profile" className="hover:underline">
          Manage profile →
        </Link>
      </p>
    </div>
  );
}
