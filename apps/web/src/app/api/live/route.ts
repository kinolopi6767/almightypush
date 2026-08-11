import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, events } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cursor = Number(req.headers.get("last-event-id")) || 0;
      let timer: ReturnType<typeof setInterval> | null = null;

      const pump = () => {
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
            sql`${events.id} > ${cursor} AND ${events.type} IN ('delivered','clicked','subscribed','unsubscribed')
              ${wsId ? sql`AND ${domains.workspace_id} = ${wsId}` : sql``}`,
          )
          .orderBy(asc(events.id))
          .limit(200)
          .all();

        for (const row of rows) {
          cursor = row.id;
          controller.enqueue(encoder.encode(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`));
        }
      };

      pump();
      timer = setInterval(pump, 1500);
      controller.enqueue(encoder.encode(`retry: 2500\n\n`));

      req.signal.addEventListener("abort", () => {
        if (timer) clearInterval(timer);
        controller.close();
      });
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
