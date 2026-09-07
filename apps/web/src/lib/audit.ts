import { auditLog } from "@pushpanel/db/schema";
import type { PushDb } from "@pushpanel/db";
import { logger } from "./logger";

export type AuditAction =
  | "domain.create"
  | "domain.update"
  | "domain.delete"
  | "campaign.create"
  | "campaign.cancel"
  | "campaign.retry"
  | "campaign.duplicate"
  | "campaign.delete"
  | "automation.create"
  | "automation.toggle"
  | "automation.run"
  | "automation.delete"
  | "segment.create"
  | "segment.update"
  | "segment.delete"
  | "template.create"
  | "template.update"
  | "template.delete"
  | "link.create"
  | "link.delete"
  | "channel.create"
  | "channel.toggle"
  | "channel.delete"
  | "settings.update"
  | "backup.create"
  | "backup.delete"
  | "backup.restore"
  | "backup.download"
  | "profile.update"
  | "profile.totp.enabled"
  | "profile.totp.disabled"
  | "api_key.create"
  | "api_key.revoke"
  | "team.invite"
  | "team.accept"
  | "team.revoke"
  | "data.export"
  | "data.import"
  | "journey.create"
  | "journey.pause"
  | "journey.resume"
  | "journey.delete"
  | "track.ingest";

/** Append a row to the audit log. Best-effort: never throws into callers. */
export function logAudit(
  db: PushDb,
  opts: {
    workspaceId: number;
    userId?: number;
    action: AuditAction;
    entityType?: string;
    entityId?: number;
    meta?: Record<string, string | number | boolean | null>;
  },
): void {
  try {
    // Truncate per-value BEFORE stringify: slicing the final JSON string can
    // cut mid-escape and store invalid JSON that breaks log readers. Keys and
    // strings are bounded; the whole object is capped as a backstop (valid
    // JSON either way — never a truncated fragment).
    let metaJson: string | null = null;
    if (opts.meta) {
      const safe: Record<string, string | number | boolean | null> = {};
      for (const [k, v] of Object.entries(opts.meta)) {
        safe[k.slice(0, 64)] = typeof v === "string" ? v.slice(0, 500) : v;
      }
      metaJson = JSON.stringify(safe);
      if (metaJson.length > 4000) metaJson = JSON.stringify({ truncated: true, keys: Object.keys(safe) });
    }
    db.insert(auditLog)
      .values({
        workspace_id: opts.workspaceId,
        user_id: opts.userId ?? null,
        action: opts.action,
        entity_type: opts.entityType ?? null,
        entity_id: opts.entityId ?? null,
        meta_json: metaJson,
      })
      .run();
  } catch (err) {
    // Audit must never break the underlying operation, but a failing insert
    // (disk full, locked DB) silently loses the security trail — log
    // structurally so ops notice while the caller proceeds.
    logger.error("audit insert failed", { action: opts.action, workspaceId: opts.workspaceId, error: err });
  }
}