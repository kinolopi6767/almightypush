import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { sha256Hex } from "@pushpanel/core";
import { events, subscribers } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  endpoint: z.string().url(),
});

/** Public unsubscribe endpoint — called by the client SDK on logout/opt-out. */
export async function POST(req: Request) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { domainId, endpoint } = parsed.data;
  const tokenHash = sha256Hex(endpoint);

  const [row] = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, tokenHash)))
    .limit(1)
    .all();
  if (!row) return NextResponse.json({ ok: false, error: "Not subscribed" }, { status: 404 });

  const now = new Date().toISOString();
  db.update(subscribers)
    .set({ unsubscribed_at: now, unsub_reason: "api" })
    .where(eq(subscribers.id, row.id))
    .run();
  db.insert(events).values({ domain_id: domainId, subscriber_id: row.id, type: "unsubscribed" }).run();

  return NextResponse.json({ ok: true });
}
