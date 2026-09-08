import { createReadStream } from "node:fs";
import path from "node:path";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { backups } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { isOwner } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Streams a backup file from disk. Auth-gated (session cookie) and restricted
 * to the owner role — a backup is a full snapshot of the database, so no
 * non-owner account may ever read one. The file path comes from the backups
 * table (created by the panel via VACUUM INTO).
 *
 * Optimizations: async stat (non-blocking), ETag (mtime+size), Range support
 * for resume, proper cache headers, and backpressure-aware streaming.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  // Fail closed: unknown/missing roles are viewers, never owners.
  if (!isOwner(session.user.role)) return new Response("Forbidden", { status: 403 });

  // Same-origin guard: a backup is a full DB snapshot served as a download —
  // a cross-site top-level navigation would otherwise start an authenticated
  // exfil-to-disk with the victim's cookies (SameSite=Lax allows top-level
  // GETs). Browsers sending a foreign Origin/Referer are rejected here.
  const { isSameOriginRequest } = await import("@/lib/csrf");
  if (!isSameOriginRequest(req)) return new Response("Origin not allowed", { status: 403 });

  // Rate-limit backup downloads: 10/min per user + 30/min globally (prevent exfiltration loops)
  const { rateLimitWithHeaders, rateLimitHeaders } = await import("@/lib/rate-limit");
  const { clientIp } = await import("@/lib/rate-limit");
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`backup:dl:${session.user.id ?? ip}`, 10, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 10) });
  const rlGlobal = rateLimitWithHeaders("backup:dl:all", 30, 60_000);
  if (!rlGlobal.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rlGlobal, 30) });

  const { id } = await params;
  const backupId = Number(id);
  if (!Number.isInteger(backupId) || backupId <= 0) return new Response("Bad id", { status: 400 });

  const [row] = db.select({ location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row?.location) return new Response("Not found", { status: 404 });

  // Path traversal hardening FIRST: the location comes from the DB (an admin-
  // controlled value). Validate before audit + stat so traversal probes and
  // missing files never spam the audit log.
  try {
    const { resolve } = await import("node:path");
    const { resolveDbPath } = await import("@pushpanel/db");
    const dbFile = resolveDbPath(process.env.DATABASE_PATH);
    const allowedDir = resolve(dbFile, "..", "backups");
    const resolved = resolve(row.location);
    if (!resolved.startsWith(allowedDir + path.sep) && resolved !== allowedDir) return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  logAudit(db, {
    workspaceId: session.user.workspaceId ? Number(session.user.workspaceId) : 0,
    userId: Number.isFinite(Number(session.user.id)) ? Number(session.user.id) : 0,
    action: "backup.download",
    entityType: "backup",
    entityId: backupId,
  });

  let stats;
  try {
    stats = await stat(row.location);
  } catch {
    return new Response("File missing", { status: 404 });
  }
  if (!stats.isFile()) return new Response("Not found", { status: 404 });

  const etag = `"${createHash("sha1").update(`${stats.mtimeMs}-${stats.size}`).digest("hex")}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const range = req.headers.get("range");
  let start = 0;
  let end = stats.size - 1;
  let status = 200;

  if (range) {
    // Single-range only: multipart (",") is rejected rather than silently
    // serving the wrong bytes (previous code served the first byte of
    // "bytes=0-0,-1" and the FIRST 500 bytes of a "bytes=-500" suffix ask).
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || range.includes(",")) {
      return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
    }
    const [, startStrRaw, endStrRaw] = match;
    const startStr = startStrRaw ?? "";
    const endStr = endStrRaw ?? "";
    if (!startStr && !endStr) {
      return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
    }
    if (!startStr) {
      // Suffix range: last N bytes.
      const suffix = parseInt(endStr, 10);
      if (Number.isNaN(suffix) || suffix <= 0) {
        return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
      }
      start = Math.max(0, stats.size - suffix);
    } else {
      start = parseInt(startStr, 10);
      end = endStr ? parseInt(endStr, 10) : stats.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stats.size || end >= stats.size) {
        return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
      }
    }
    status = 206;
  }

  const contentLength = end - start + 1;
  const stream = createReadStream(row.location, { start, end });
  // Backpressure-aware bridge: pause the file stream while the client drains
  // slowly, otherwise a slow reader buffers the whole backup in memory.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) => {
        const buf = new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        controller.enqueue(buf);
        if ((controller.desiredSize ?? 1) <= 0) stream.pause();
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    pull() {
      // Client drained — resume the file stream.
      stream.resume();
    },
    cancel() {
      stream.destroy();
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="backup-${backupId}.db"`,
    "Content-Length": String(contentLength),
    ETag: etag,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
  };
  if (status === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`;
  }

  return new Response(body, { status, headers });
}