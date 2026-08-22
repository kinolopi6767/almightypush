import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { parseAutomationConfig, verifyWebhook } from "@pushpanel/core";
import { automations } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/**
 * M4: public webhook trigger for push_on_publish automations.
 * Auth: X-PushPanel-Signature = sha256=<HMAC-SHA256(secret, "<ts>.<body>")>,
 * with the per-automation secret shown in the panel. The signature covers
 * X-PushPanel-Timestamp (must be within the last 5 minutes), so a captured
 * request cannot be replayed with a fresh header. On success the automation's
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

  // Uniform pre-auth response: whether the id, secret or signature is wrong,
  // outsiders get the same 401 — no enumeration of automation ids/types.
  const config = automation ? parseAutomationConfig(automation.config_json) : null;
  const secret = config?.secret ?? null;

  const signature = req.headers.get("X-PushPanel-Signature");
  if (!automation || !config || !secret || !verifyWebhook(secret, body, signature, timestamp)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (automation.type !== "push_on_publish") {
    return NextResponse.json({ ok: false, error: "This automation type is not webhook-triggered" }, { status: 409 });
  }

  if (automation.status !== "active") {
    return NextResponse.json({ ok: false, error: "Automation is not active" }, { status: 409 });
  }

  // Replay dedupe: a captured request is valid for 5 minutes (timestamp
  // window), so an identical retry would otherwise fire a second push.
  // Reject any timestamp we have already seen.
  if ((config.last_seen_ts ?? 0) >= timestamp) {
    return NextResponse.json({ ok: false, error: "Replayed webhook request" }, { status: 409 });
  }

  db.update(automations)
    .set({ next_run_at: new Date().toISOString(), config_json: JSON.stringify({ ...config, last_seen_ts: timestamp }) })
    .where(eq(automations.id, id))
    .run();

  return NextResponse.json({ ok: true });
}