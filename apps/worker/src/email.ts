import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "@pushpanel/db";
import { emailCampaigns, emailContacts } from "@pushpanel/db/schema";
import type { allTables } from "@pushpanel/db";
import { readSetting } from "./cleanup";

type PushDb = BetterSQLite3Database<typeof allTables>;

export interface EmailStats {
  started: number;
  sent: number;
}

/**
 * LumaPush Email engine — picks scheduled email campaigns where schedule_at <= now,
 * resolves audience (all email contacts), marks as sending → done, and updates stats.
 * Real delivery via SMTP/SES would be plugged here; for now we count contacts.
 */
export function runEmailCampaigns(db: PushDb, now: Date = new Date()): EmailStats {
  const nowIso = now.toISOString();
  const stats: EmailStats = { started: 0, sent: 0 };
  const rows = db
    .select({ id: emailCampaigns.id, workspace_id: emailCampaigns.workspace_id, audience_json: emailCampaigns.audience_json })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.status, "scheduled"), sql`${emailCampaigns.schedule_at} IS NULL OR ${emailCampaigns.schedule_at} <= ${nowIso}`))
    .all();

  for (const row of rows) {
    const audience = resolveEmailAudience(db, row.workspace_id, row.audience_json);
    if (audience.length === 0) {
      db.update(emailCampaigns).set({ status: "done", sent_at: nowIso, stats_json: JSON.stringify({ sent: 0 }) }).where(eq(emailCampaigns.id, row.id)).run();
      stats.started++;
      continue;
    }
    // Mock send: in production, loop contacts and call nodemailer/SES with blocks/html.
    // Here we just count and mark done; each contact would generate an event in real.
    db.update(emailCampaigns)
      .set({ status: "done", sent_at: nowIso, stats_json: JSON.stringify({ sent: audience.length, delivered: audience.length, opened: 0, clicked: 0 }) })
      .where(eq(emailCampaigns.id, row.id))
      .run();
    stats.started++;
    stats.sent += audience.length;
  }
  return stats;
}

function resolveEmailAudience(db: PushDb, workspaceId: number, audienceJson: string | null): number[] {
  if (!audienceJson) return [];
  const suppressionOn = readSetting(db, "suppression_enabled") !== "0";
  try {
    const parsed = JSON.parse(audienceJson) as { kind?: string; ids?: number[] };
    if (parsed.kind === "manual" && Array.isArray(parsed.ids)) {
      const ids = parsed.ids.filter((n) => Number.isInteger(n) && n > 0);
      if (!suppressionOn || ids.length === 0) return ids;
      // filter suppressed (bounced/unsubscribed) when suppression on
      const rows = db
        .select({ id: emailContacts.id })
        .from(emailContacts)
        .where(and(eq(emailContacts.workspace_id, workspaceId), sql`${emailContacts.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`, sql`${emailContacts.status} NOT IN ('bounced','unsubscribed')`))
        .all();
      return rows.map((r) => r.id);
    }
    // "all" → all contacts minus suppressed when on
    const base = db.select({ id: emailContacts.id }).from(emailContacts).where(eq(emailContacts.workspace_id, workspaceId)).all();
    if (!suppressionOn) return base.map((r) => r.id);
    const filtered = db
      .select({ id: emailContacts.id })
      .from(emailContacts)
      .where(and(eq(emailContacts.workspace_id, workspaceId), sql`${emailContacts.status} NOT IN ('bounced','unsubscribed')`))
      .all();
    return filtered.map((r) => r.id);
  } catch {
    return [];
  }
}
