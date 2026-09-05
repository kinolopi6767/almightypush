import { auditLog } from "@pushpanel/db/schema";
import type { PushDb } from "@pushpanel/db";
import { logger } from "./logger";

export type AuditAction =
  | "domain.create"
  | "domain.update"
  | "domain.delete"
  | "campaign.create"
  | "campaign.cancel"
  | "campaign.duplicate"
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
  | "profile.update"
  | "profile.totp.enabled"
  | "profile.totp.disabled"
  | "api_key.create"
  | "api_key.revoke";

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
    // Premium: truncate meta to avoid SQLITE_TOOBIG on large payloads
    const metaJson = opts.meta ? JSON.stringify(opts.meta).slice(0, 4000) : null;
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