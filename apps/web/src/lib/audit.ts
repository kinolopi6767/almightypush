import { auditLog } from "@pushpanel/db/schema";
import type { PushDb } from "@pushpanel/db";

export type AuditAction =
  | "domain.create"
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
  | "settings.update"
  | "backup.create"
  | "backup.delete"
  | "profile.update"
  | "profile.totp.enabled"
  | "profile.totp.disabled";

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
    db.insert(auditLog)
      .values({
        workspace_id: opts.workspaceId,
        user_id: opts.userId ?? null,
        action: opts.action,
        entity_type: opts.entityType ?? null,
        entity_id: opts.entityId ?? null,
        meta_json: opts.meta ? JSON.stringify(opts.meta) : null,
      })
      .run();
  } catch {
    // audit logging must never break the underlying operation
  }
}