import { and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireExportAccess } from "@/lib/export-guard";
import { auditLog } from "@pushpanel/db/schema";
import { csvCell } from "@pushpanel/core";

export const dynamic = "force-dynamic";

/**
 * Audit-trail export as RFC-4180 CSV. Workspace-scoped, non-viewer roles
 * only, audited via the shared export guard, streamed in bounded batches so
 * large trails export in constant memory. A mid-stream DB failure errors the
 * stream instead of truncating the file with a 200 status.
 */
export async function GET(req: Request) {
  const gate = await requireExportAccess(req);
  if (!gate.ok) return gate.response;
  const wsId = gate.ctx.wsId;

  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`export:audit:${wsId}:${clientIp(req.headers)}`, 20, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 20) });

  logAudit(db, {
    workspaceId: wsId,
    userId: Number.isFinite(gate.ctx.userId) ? gate.ctx.userId : undefined,
    action: "data.export",
    entityType: "export",
    meta: { kind: "audit" },
  });

  const header = "id,action,entity_type,entity_id,user_id,ts,meta_json\n";
  const encoder = new TextEncoder();
  const batchSize = 500;
  let lastId = Number.MAX_SAFE_INTEGER;
  let sentHeader = false;
  let done = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        if (done) {
          controller.close();
          return;
        }
        if (!sentHeader) {
          controller.enqueue(encoder.encode(header));
          sentHeader = true;
        }
        const batch = db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            entity_type: auditLog.entity_type,
            entity_id: auditLog.entity_id,
            user_id: auditLog.user_id,
            ts: auditLog.ts,
            meta_json: auditLog.meta_json,
          })
          .from(auditLog)
          .where(and(sql`${auditLog.workspace_id} = ${wsId}`, sql`${auditLog.id} < ${lastId}`))
          .orderBy(desc(auditLog.id))
          .limit(batchSize)
          .all();
        if (batch.length === 0) {
          done = true;
          controller.close();
          return;
        }
        const lines = batch
          .map((r) =>
            [r.id, r.action, r.entity_type, r.entity_id, r.user_id, r.ts, r.meta_json]
              .map((v) => csvCell(v === null || v === undefined ? "" : String(v)))
              .join(","),
          )
          .join("\r\n");
        controller.enqueue(encoder.encode(lines + "\r\n"));
        lastId = batch[batch.length - 1]!.id;
        if (batch.length < batchSize) {
          done = true;
          controller.close();
        }
      } catch (err) {
        done = true;
        controller.error(err instanceof Error ? err : new Error("Export failed"));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
