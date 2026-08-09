import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parseAutomationConfig, verifyWebhook } from "@pushpanel/core";
import { automations } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/**
 * M4: public webhook trigger for push_on_publish automations.
 * Auth: X-PushPanel-Signature = sha256=<HMAC-SHA256(secret, raw body)>, with
 * the per-automation secret shown in the panel. X-PushPanel-Timestamp must be
 * within the last 5 minutes (replay guard). On success the automation's
 * next_run_at is set to now and the worker picks it up on the next tick.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid automation id" }, { status: 400 });
  }

  const timestamp = Number(req.headers.get("x-pushpanel-timestamp") ?? "0");
  if (!timestamp || Math.abs(Date.now() - timestamp) > 5 * 60_000) {
    return NextResponse.json({ ok: false, error: "Stale or missing timestamp" }, { status: 401 });
  }

  const body = await req.text();
  if (body.length > 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  const [automation] = db
    .select({ id: automations.id, status: automations.status, config_json: automations.config_json, type: automations.type })
    .from(automations)
    .where(eq(automations.id, id))
    .limit(1)
    .all();
  if (!automation) return NextResponse.json({ ok: false, error: "Automation not found" }, { status: 404 });

  const config = parseAutomationConfig(automation.config_json);
  const secret = config.secret;
  if (!secret) return NextResponse.json({ ok: false, error: "Automation has no webhook secret" }, { status: 500 });

  const signature = req.headers.get("X-PushPanel-Signature");
  if (!verifyWebhook(secret, body, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  if (automation.status !== "active") {
    return NextResponse.json({ ok: false, error: "Automation is not active" }, { status: 409 });
  }

  db.update(automations)
    .set({ next_run_at: new Date().toISOString() })
    .where(and(eq(automations.id, id), eq(automations.type, "push_on_publish")))
    .run();

  return NextResponse.json({ ok: true });
}