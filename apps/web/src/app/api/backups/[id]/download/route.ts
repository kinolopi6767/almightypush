import { createReadStream, statSync } from "node:fs";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { backups } from "@pushpanel/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Streams a backup file from disk. Auth-gated (session cookie); the file path
 * comes from the backups table (created by the panel via VACUUM INTO).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const backupId = Number(id);
  if (!Number.isInteger(backupId)) return new Response("Bad id", { status: 400 });

  const [row] = db.select({ location: backups.location }).from(backups).where(eq(backups.id, backupId)).limit(1).all();
  if (!row?.location) return new Response("Not found", { status: 404 });

  let stats;
  try {
    stats = statSync(row.location);
  } catch {
    return new Response("File missing", { status: 404 });
  }
  if (!stats.isFile()) return new Response("Not found", { status: 404 });

  // Manual adapter: the build-time `node:stream` shim may lack Readable.toWeb,
  // so bridge the fs stream to a WHATWG stream by hand.
  const stream = createReadStream(row.location);
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

  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="backup-${backupId}.db"`,
      "Content-Length": String(stats.size),
    },
  });
}