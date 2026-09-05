import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { domains, subscribers } from "@pushpanel/db/schema";
import { createCipher, csvCell } from "@pushpanel/core";

export const dynamic = "force-dynamic";

/**
 * D11 round-trip subscriber export (decrypted endpoint + keys) as a streaming
 * CSV download. Session-gated AND workspace-scoped to the requested domain.
 * Streams with true keyset pagination — a 1M-row domain exports in constant
 * memory, and the megabyte payload never passes through a server action.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const wsId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!wsId) return new Response("No workspace", { status: 400 });

  const url = new URL(req.url);
  const domainId = Number(url.searchParams.get("domainId"));
  if (!Number.isInteger(domainId) || domainId <= 0) return new Response("Bad domainId", { status: 400 });

  // Workspace ownership — same discipline as the panel actions.
  const [domain] = db
    .select({ id: domains.id, name: domains.name })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspace_id, wsId)))
    .limit(1)
    .all();
  if (!domain) return new Response("Not found", { status: 404 });

  const { rateLimitWithHeaders, rateLimitHeaders, clientIp } = await import("@/lib/rate-limit");
  const rl = rateLimitWithHeaders(`export:roundtrip:${wsId}:${clientIp(req.headers)}`, 10, 60_000);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl, 10) });

  const encKey = process.env.APP_ENC_KEY;
  if (!encKey) return new Response("Server encryption key not configured", { status: 500 });
  const cipher = createCipher(encKey);

  // Round-trip guarantee: the import path requires p256dh + auth, so the
  // export must include them or exported files could never be re-imported.
  const header = "id,endpoint,p256dh,auth,browser,os,device,country,state,subscribe_url,subscribe_at,last_active_at,unsubscribed_at,provider";
  const encoder = new TextEncoder();
  const PAGE = 2_000;
  let lastId = 0;
  let sentHeader = false;
  let done = false;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (done) {
        controller.close();
        return;
      }
      if (!sentHeader) {
        controller.enqueue(encoder.encode(header + "\n"));
        sentHeader = true;
      }
      const rows = db
        .select()
        .from(subscribers)
        .where(and(eq(subscribers.domain_id, domainId), gt(subscribers.id, lastId)))
        .orderBy(subscribers.id)
        .limit(PAGE)
        .all();
      if (rows.length === 0) {
        done = true;
        controller.close();
        return;
      }
      const lines: string[] = [];
      for (const s of rows) {
        lastId = s.id;
        let endpoint = "";
        let p256dh = "";
        let authKey = "";
        if (s.token) {
          try {
            const parsed = JSON.parse(cipher.decrypt(s.token)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
            endpoint = parsed.endpoint ?? "";
            p256dh = parsed.keys?.p256dh ?? "";
            authKey = parsed.keys?.auth ?? "";
          } catch {
            endpoint = "";
          }
        }
        lines.push(
          [
            s.id,
            csvCell(endpoint),
            csvCell(p256dh),
            csvCell(authKey),
            csvCell(s.browser),
            csvCell(s.os),
            csvCell(s.device),
            csvCell(s.country),
            csvCell(s.state),
            csvCell(s.subscribe_url),
            csvCell(s.subscribe_at),
            csvCell(s.last_active_at),
            csvCell(s.unsubscribed_at),
            csvCell(s.provider),
          ].join(","),
        );
      }
      controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
      if (rows.length < PAGE) {
        done = true;
        controller.close();
      }
    },
  });

  // Light cache-defensive headers: this payload contains live push tokens.
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscribers-domain-${domainId}-${Date.now()}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
