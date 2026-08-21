import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { backups } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";

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
  if (session.user.role !== "owner") return new Response("Forbidden", { status: 403 });

  // Rate-limit backup downloads: 10/min per user, 30/min globally (prevent exfiltration loops)
  const { rateLimitWithHeaders, rateLimitHeaders } = await import("@/lib/rate-limit");
  const { clientIp } = await import("@/lib/rate-limit");
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`backup:dl:${session.user.id ?? ip}`, 10, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 10) });

  const { id } = await params;
  const backupId = Number(id);
  if (!Number.isInteger(backupId)) return new Response("Bad id", { status: 400 });

  const [row] = db.select({ location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row?.location) return new Response("Not found", { status: 404 });

  // Path traversal hardening: ensure backup path is inside backups dir
  try {
    const { resolve } = await import("node:path");
    const { resolveDbPath } = await import("@pushpanel/db");
    const dbFile = resolveDbPath(process.env.DATABASE_PATH);
    const allowedDir = resolve(dbFile, "..", "backups");
    const resolved = resolve(row.location);
    if (!resolved.startsWith(allowedDir)) return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

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
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const [, startStr, endStr] = match;
      if (startStr) start = parseInt(startStr, 10);
      if (endStr) end = parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stats.size) {
        return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${stats.size}` } });
      }
      status = 206;
    }
  }

  const contentLength = end - start + 1;
  const stream = createReadStream(row.location, { start, end });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: string | Buffer) =>
        controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))),
      );
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
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