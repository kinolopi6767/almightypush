import { asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, events } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** Stream lifetime cap: the session is validated once at connect, so a long-lived
 * stream could outlive logout. Clients reconnect automatically (EventSource),
 * re-running auth — 10 minutes is invisible in practice and bounds exposure. */
const MAX_STREAM_MS = 10 * 60_000;

/**
 * Live activity feed (SSE — m10 backlog B11/E6). Authenticated via the
 * session cookie; the client reconnects automatically (EventSource) and
 * resumes from the last received event id. New `events` rows (delivered,
 * clicked, …) for the workspace are streamed as they are written.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return new Response("Forbidden", { status: 403 });

  // Connection throttle: each stream polls the DB every 1.5s for 10min.
  const { rateLimit } = await import("@/lib/rate-limit");
  const who = session.user.id ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!rateLimit(`live:${wsId}:${who}`, 5, 60_000)) {
    return new Response("Too many live connections", { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Clamp the resume cursor: negative/garbage Last-Event-ID must not
      // replay history from id 1. On a FIRST connect (no resume header) the
      // cursor starts at the newest event — replaying the entire history
      // would take hours to reach "live" on a large workspace while dumping
      // years-old rows into a feed that shows only the last few.
      const resumeHeader = Number(req.headers.get("last-event-id"));
      const hasResume = Number.isFinite(resumeHeader) && resumeHeader > 0;
      let cursor = hasResume
        ? resumeHeader
        : (db.select({ max: sql<number>`coalesce(max(${events.id}), 0)` }).from(events).get()?.max ?? 0);
      let timer: ReturnType<typeof setInterval> | null = null;
      let closed = false;
      let consecutiveErrors = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already errored/closed by the runtime
        }
      };

      const pump = () => {
        if (closed) return;
        try {
          const rows = db
            .select({
              id: events.id,
              type: events.type,
              campaign_id: events.campaign_id,
              meta_json: events.meta_json,
              ts: events.ts,
            })
            .from(events)
            .innerJoin(domains, sql`${domains.id} = ${events.domain_id}`)
            .where(
              sql`${events.id} > ${cursor} AND ${events.type} IN ('delivered','clicked','subscribed','unsubscribed','notification_closed','prompt_shown','prompt_allowed','prompt_denied','prompt_dismissed')
                ${wsId ? sql`AND ${domains.workspace_id} = ${wsId}` : sql``}`,
            )
            .orderBy(asc(events.id))
            .limit(200)
            .all();

          for (const row of rows) {
            cursor = row.id;
            controller.enqueue(encoder.encode(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`));
          }
          // Heartbeat keeps idle proxies from killing the stream.
          controller.enqueue(encoder.encode(`: ping\n\n`));
          consecutiveErrors = 0;
        } catch {
          // SQLITE_BUSY / transient lock contention must not crash the
          // process from inside a setInterval callback.
          consecutiveErrors++;
          if (consecutiveErrors >= 5) close();
        }
      };

      pump();
      controller.enqueue(encoder.encode(`retry: 2500\n\n`));
      timer = setInterval(pump, 1500);

      req.signal.addEventListener("abort", close);
      setTimeout(close, MAX_STREAM_MS).unref?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
