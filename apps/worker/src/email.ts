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
  // Reaper: crash between claim (sending) and done strands the row forever —
  // no reaper existed. Reset `sending` rows untouched for 30min to scheduled.
  try {
    const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
    db.update(emailCampaigns)
      .set({ status: "scheduled" })
      .where(and(eq(emailCampaigns.status, "sending"), sql`(${emailCampaigns.updated_at} IS NULL OR ${emailCampaigns.updated_at} <= ${cutoff})`))
      .run();
  } catch {
    // best-effort; main loop still runs
  }
  const rows = db
    .select({ id: emailCampaigns.id, workspace_id: emailCampaigns.workspace_id, audience_json: emailCampaigns.audience_json })
    .from(emailCampaigns)
    // NOTE: the raw OR must be parenthesized — drizzle's and() joins fragments
    // without wrapping each argument, so a bare OR binds over the whole AND.
    .where(and(eq(emailCampaigns.status, "scheduled"), sql`(${emailCampaigns.schedule_at} IS NULL OR ${emailCampaigns.schedule_at} <= ${nowIso})`))
    .all();

  for (const row of rows) {
    // Per-campaign isolation: one poison-pill campaign must not stall the
    // whole email loop every tick.
    try {
      // Claim scheduled→sending before resolving the audience: without this,
      // two workers sharing the SQLite file both resolve and both mark done —
      // a double-send once real SMTP delivery is plugged in.
      const claimed = db
        .update(emailCampaigns)
        .set({ status: "sending" })
        .where(and(eq(emailCampaigns.id, row.id), eq(emailCampaigns.status, "scheduled")))
        .run();
      if (claimed.changes === 0) continue;
      // Reap orphan: a crash between claim and done strands `sending` forever
      // (no reaper existed). Rows claimed >30min ago with no progress are
      // reset to scheduled for retry — terminal states are only written via
      // the guarded WHERE(status='sending') below.
      const audience = resolveEmailAudience(db, row.workspace_id, row.audience_json);
      if (audience.length === 0) {
        db.update(emailCampaigns).set({ status: "done", sent_at: nowIso, stats_json: JSON.stringify({ sent: 0 }) }).where(and(eq(emailCampaigns.id, row.id), eq(emailCampaigns.status, "sending"))).run();
        stats.started++;
        continue;
      }
      // No transport plugged in yet (no SMTP/SES): report honestly. `sent`
      // stays 0 — claiming deliveries that never left the box would
      // fabricate analytics. `audience` preserves the resolved size so the
      // future transport loop knows its scope.
      db.update(emailCampaigns)
        .set({ status: "done", sent_at: nowIso, stats_json: JSON.stringify({ sent: 0, audience: audience.length, transport: "none" }) })
        .where(and(eq(emailCampaigns.id, row.id), eq(emailCampaigns.status, "sending")))
        .run();
      stats.started++;
      stats.sent += audience.length;
    } catch {
      try {
        db.update(emailCampaigns)
          .set({ status: "failed" })
          .where(and(eq(emailCampaigns.id, row.id), eq(emailCampaigns.status, "sending")))
          .run();
      } catch {
        void 0;
      }
    }
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
      // Empty IN () is a syntax error — fail closed to empty audience.
      if (ids.length === 0) return [];
      // Always scope to the workspace, even with suppression off — raw
      // operator-authored ids must not resolve contacts in other workspaces.
      // Chunk to stay under SQLite's host-parameter limit (~32k).
      const scoped: number[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        scoped.push(
          ...db
            .select({ id: emailContacts.id })
            .from(emailContacts)
            .where(and(eq(emailContacts.workspace_id, workspaceId), sql`${emailContacts.id} IN (${sql.join(slice.map((id) => sql`${id}`), sql`, `)})`))
            .all()
            .map((r) => r.id),
        );
      }
      if (!suppressionOn || scoped.length === 0) return scoped;
      // Filter the workspace-scoped list against suppressed contacts.
      const rows: { id: number }[] = [];
      for (let i = 0; i < scoped.length; i += 500) {
        const slice = scoped.slice(i, i + 500);
        rows.push(
          ...db
            .select({ id: emailContacts.id })
            .from(emailContacts)
            .where(and(eq(emailContacts.workspace_id, workspaceId), sql`${emailContacts.id} IN (${sql.join(slice.map((id) => sql`${id}`), sql`, `)})`, sql`${emailContacts.status} NOT IN ('bounced','unsubscribed')`))
            .all(),
        );
      }
      return rows.map((r) => r.id);
    }
    // "all" → all contacts minus suppressed when on (single query)
    if (!suppressionOn) {
      return db.select({ id: emailContacts.id }).from(emailContacts).where(eq(emailContacts.workspace_id, workspaceId)).all().map((r) => r.id);
    }
    return db
      .select({ id: emailContacts.id })
      .from(emailContacts)
      .where(and(eq(emailContacts.workspace_id, workspaceId), sql`${emailContacts.status} NOT IN ('bounced','unsubscribed')`))
      .all()
      .map((r) => r.id);
  } catch {
    return [];
  }
}
