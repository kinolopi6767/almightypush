import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, domains, segments } from "@pushpanel/db/schema";
import { requireApiKey, domainAllowed } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_BUTTONS = 3; // W3C spec limit — keep as is for compat
const MAX_TITLE = 120;
const MAX_MESSAGE = 500;
const MAX_MANUAL_IDS = 1_000_000; // personal use: effectively unlimited (was 10k)
const MAX_VARIANTS = 20; // unlocked from 10 for personal use

interface SendBody {
  domain: string | number;
  title: string;
  title_b?: string;
  message?: string;
  url?: string;
  icon_url?: string;
  image_url?: string;
  buttons?: { label: string; url: string }[];
  audience?: { kind: "all" } | { kind: "manual"; ids: number[] } | { kind: "segment"; segment_id: number };
  schedule?: string;
  topic?: string;
  ttl?: number;
  urgency?: string;
  variants?: { title: string; message?: string; image_url?: string; weight?: number }[];
  channel?: string;
}

const BUTTON_LABEL_RE = /^[A-Za-z0-9 _\-.,!?'"():;&+$#]{1,24}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:?\d{2})?$/;

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * H6: send a campaign via REST. POST /api/v1/send
 * Audience kinds mirror the panel: all / manual ids / segment (segment
 * sending via API — H6). Campaigns are created as `scheduled` with
 * schedule_at = now (or the given ISO time) and the worker scheduler picks
 * them up on its next tick.
 */
export async function POST(req: Request) {
  const auth = requireApiKey(req.headers);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE) {
    return NextResponse.json({ ok: false, error: `title is required (max ${MAX_TITLE} chars)` }, { status: 400 });
  }
  const titleB = typeof body.title_b === "string" && body.title_b.trim() ? body.title_b.trim() : null;
  if (titleB && titleB.length > MAX_TITLE) {
    return NextResponse.json({ ok: false, error: `title_b too long (max ${MAX_TITLE} chars)` }, { status: 400 });
  }
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (message && message.length > MAX_MESSAGE) {
    return NextResponse.json({ ok: false, error: `message too long (max ${MAX_MESSAGE} chars)` }, { status: 400 });
  }
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
  if (url && !isValidHttpUrl(url)) return NextResponse.json({ ok: false, error: "url must be http(s)" }, { status: 400 });
  const iconUrl = typeof body.icon_url === "string" && body.icon_url.trim() ? body.icon_url.trim() : null;
  if (iconUrl && !isValidHttpUrl(iconUrl)) return NextResponse.json({ ok: false, error: "icon_url must be http(s)" }, { status: 400 });
  const imageUrl = typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;
  if (imageUrl && !isValidHttpUrl(imageUrl)) return NextResponse.json({ ok: false, error: "image_url must be http(s)" }, { status: 400 });

  const buttonsRaw = Array.isArray(body.buttons) ? body.buttons : [];
  if (buttonsRaw.length > MAX_BUTTONS) {
    return NextResponse.json({ ok: false, error: `at most ${MAX_BUTTONS} buttons` }, { status: 400 });
  }
  const seenLabels = new Set<string>();
  const buttons: { label: string; url: string }[] = [];
  for (const b of buttonsRaw) {
    const label = typeof b?.label === "string" ? b.label.trim() : "";
    const bUrl = typeof b?.url === "string" ? b.url.trim() : "";
    if (!BUTTON_LABEL_RE.test(label) || !isValidHttpUrl(bUrl)) {
      return NextResponse.json({ ok: false, error: "button label (max 24 chars) and http(s) url required" }, { status: 400 });
    }
    if (seenLabels.has(label)) return NextResponse.json({ ok: false, error: `duplicate button label "${label}"` }, { status: 400 });
    seenLabels.add(label);
    buttons.push({ label, url: bUrl });
  }

  // Domain resolution: id (number or numeric string) or name, must belong to the
  // workspace and be covered by the key's domain scope.
  const domainParam = body.domain;
  const domainTrimmed = typeof domainParam === "string" ? domainParam.trim() : "";
  const domainNumeric = domainTrimmed !== "" && /^\d+$/.test(domainTrimmed) ? Number(domainTrimmed) : null;
  const domainRows = typeof domainParam === "number"
    ? db.select().from(domains).where(and(eq(domains.id, domainParam), eq(domains.workspace_id, auth.context.workspaceId))).limit(1).all()
    : domainNumeric !== null
      ? db.select().from(domains).where(and(eq(domains.id, domainNumeric), eq(domains.workspace_id, auth.context.workspaceId))).limit(1).all()
      : domainTrimmed
        ? db.select().from(domains).where(and(eq(domains.name, domainTrimmed.toLowerCase()), eq(domains.workspace_id, auth.context.workspaceId))).limit(1).all()
        : [];
  if (domainRows.length === 0) return NextResponse.json({ ok: false, error: "domain not found in this workspace" }, { status: 404 });
  const domain = domainRows[0]!;
  if (!domainAllowed(auth.context, domain.id)) {
    return NextResponse.json({ ok: false, error: "domain not covered by this key" }, { status: 403 });
  }
  if (domain.status !== "active") {
    return NextResponse.json({ ok: false, error: "domain is not active" }, { status: 409 });
  }

  // Audience: default all; manual ids validated against the domain at send
  // time by the scheduler; segments must exist in this workspace.
  let audienceJson = JSON.stringify({ kind: "all" });
  const audience = body.audience ?? { kind: "all" };
  if (audience.kind === "manual") {
    const ids = Array.isArray(audience.ids) ? audience.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) return NextResponse.json({ ok: false, error: "manual audience needs at least one id" }, { status: 400 });
    if (ids.length > MAX_MANUAL_IDS) return NextResponse.json({ ok: false, error: `manual audience capped at ${MAX_MANUAL_IDS} ids` }, { status: 400 });
    audienceJson = JSON.stringify({ kind: "manual", ids: Array.from(new Set(ids)) });
  } else if (audience.kind === "segment") {
    const segmentId = audience.segment_id;
    if (!Number.isInteger(segmentId) || !(segmentId! > 0)) {
      return NextResponse.json({ ok: false, error: "segment_id (positive integer) required" }, { status: 400 });
    }
    const [segment] = db
      .select({ id: segments.id })
      .from(segments)
      .where(and(eq(segments.id, segmentId!), eq(segments.workspace_id, auth.context.workspaceId)))
      .limit(1)
      .all();
    if (!segment) return NextResponse.json({ ok: false, error: "segment not found" }, { status: 404 });
    // The scheduler re-validates membership per domain, so a cross-domain
    // segment safely resolves to this domain's subscribers only.
    audienceJson = JSON.stringify({ kind: "segment", segment_id: segmentId });
    db.update(segments).set({ last_used_at: new Date().toISOString() }).where(eq(segments.id, segmentId!)).run();
  } else if (audience.kind !== "all") {
    return NextResponse.json({ ok: false, error: "audience.kind must be all | manual | segment" }, { status: 400 });
  }

  // Schedule: ISO string (future or past) — past/absent means send now.
  let scheduleAt: string;
  if (body.schedule) {
    if (typeof body.schedule !== "string" || !ISO_RE.test(body.schedule)) {
      return NextResponse.json({ ok: false, error: "schedule must be an ISO timestamp" }, { status: 400 });
    }
    const t = Date.parse(body.schedule);
    if (Number.isNaN(t)) return NextResponse.json({ ok: false, error: "schedule is not a valid date" }, { status: 400 });
    scheduleAt = new Date(t).toISOString();
  } else {
    scheduleAt = new Date().toISOString();
  }

  // LumaPush: topic collapse (64ch), TTL, urgency, channel
  let topic: string | null = null;
  if (body.topic !== undefined) {
    const t = String(body.topic).trim().slice(0, 64);
    if (t) topic = t;
  }
  let ttl: number | null = null;
  if (body.ttl !== undefined) {
    const n = Number(body.ttl);
    if (!Number.isFinite(n) || n < 0 || n > 2419200) return NextResponse.json({ ok: false, error: "ttl must be 0-2419200" }, { status: 400 });
    ttl = Math.floor(n);
  }
  let urgency: string | null = null;
  if (body.urgency !== undefined) {
    const u = String(body.urgency).trim().toLowerCase();
    if (!["very-low", "low", "normal", "high"].includes(u)) return NextResponse.json({ ok: false, error: "urgency must be very-low|low|normal|high" }, { status: 400 });
    urgency = u;
  }
  const channel = body.channel === "email" ? "email" : "push";

  // LumaPush: up to 10 variants A/B/C... with weights
  let variantsJson: string | null = null;
  if (body.variants !== undefined) {
    if (!Array.isArray(body.variants) || body.variants.length < 2 || body.variants.length > MAX_VARIANTS) {
      return NextResponse.json({ ok: false, error: `variants must be array of 2-${MAX_VARIANTS}` }, { status: 400 });
    }
    const cleaned: { key: string; title: string; message?: string; image_url?: string; weight: number }[] = [];
    for (let i = 0; i < body.variants.length; i++) {
      const v = body.variants[i] as { title?: unknown; message?: unknown; image_url?: unknown; weight?: unknown };
      const vt = typeof v?.title === "string" ? v.title.trim() : "";
      if (!vt || vt.length > MAX_TITLE) return NextResponse.json({ ok: false, error: `variant ${i} title required max ${MAX_TITLE}` }, { status: 400 });
      const vm = typeof v?.message === "string" ? v.message.trim().slice(0, MAX_MESSAGE) : undefined;
      const vi = typeof v?.image_url === "string" && v.image_url.trim() ? v.image_url.trim() : undefined;
      if (vi && !isValidHttpUrl(vi)) return NextResponse.json({ ok: false, error: `variant ${i} image_url must be http(s)` }, { status: 400 });
      const w = v?.weight !== undefined ? Number(v.weight) : 10;
      if (!Number.isFinite(w) || w < 1 || w > 100) return NextResponse.json({ ok: false, error: `variant ${i} weight 1-100` }, { status: 400 });
      cleaned.push({ key: String.fromCharCode(65 + i), title: vt, message: vm, image_url: vi, weight: Math.floor(w) });
    }
    variantsJson = JSON.stringify(cleaned);
  }

  const inserted = db
    .insert(campaigns)
    .values({
      workspace_id: auth.context.workspaceId,
      domain_id: domain.id,
      channel,
      title,
      title_b: titleB,
      variants_json: variantsJson,
      message,
      launch_url: url,
      icon_url: iconUrl,
      image_url: imageUrl,
      buttons_json: buttons.length ? JSON.stringify(buttons) : null,
      audience_json: audienceJson,
      schedule_at: scheduleAt,
      scheduled: 1,
      status: "scheduled",
      source: "api",
      topic,
      ttl: ttl ?? 86400,
      urgency: urgency ?? "normal",
    })
    .run();

  const campaignId = Number(inserted.lastInsertRowid);
  logAudit(db, {
    workspaceId: auth.context.workspaceId,
    action: "campaign.create",
    entityType: "campaign",
    entityId: campaignId,
    meta: { title, domain_id: domain.id, source: "api", via: `api_key:${auth.context.keyId}` },
  });

  return NextResponse.json(
    {
      ok: true,
      id: campaignId,
      status: "scheduled",
      schedule_at: scheduleAt,
      audience: JSON.parse(audienceJson),
    },
    { status: 201 },
  );
}