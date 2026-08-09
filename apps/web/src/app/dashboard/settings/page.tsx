import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { backups, settings } from "@pushpanel/db/schema";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Panel-wide configuration and database backups.</p>
      </div>

      <SettingsForm timezone={timezoneRow?.value ?? ""} retentionDays={retentionRow?.value ?? "30"} />

      <BackupsPanel rows={backupList} />

      <p className="text-xs text-muted-foreground">
        <Link href="/dashboard/profile" className="hover:underline">
          Manage profile →
        </Link>
      </p>
    </div>
  );
}
