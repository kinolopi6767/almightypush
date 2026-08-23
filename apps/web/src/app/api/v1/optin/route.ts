import { corsJson, handlePublicOptions } from "@/lib/cors";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { clientIp, rateLimitHeaders, rateLimitWithHeaders } from "@/lib/rate-limit";
import { domains, events } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domainId: z.coerce.number().int().positive(),
  stage: z.enum(["prompt_shown", "prompt_allowed", "prompt_denied", "prompt_dismissed"]),
});

/**
 * Opt-in funnel telemetry from the SDK prompt engine — no PII, just stage
 * counters so the panel can show grant-rate analytics per domain.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`optin:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return corsJson({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return corsJson({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { domainId, stage } = parsed.data;

  const rlDom = rateLimitWithHeaders(`optin:dom:${domainId}`, 300, 60_000);
  if (!rlDom.allowed) {
    return corsJson({ ok: false, error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rlDom, 300) });
  }

  const [domain] = db.select({ id: domains.id, status: domains.status }).from(domains).where(eq(domains.id, domainId)).limit(1).all();
  if (!domain || domain.status !== "active") return corsJson({ ok: false, error: "Unknown domain" }, { status: 404 });

  // Dedupe within a browser session is handled SDK-side (sessionStorage);
  // here we only bound volume.
  try {
    db.insert(events).values({ domain_id: domain.id, type: stage }).run();
    return corsJson({ ok: true });
  } catch {
    return corsJson({ ok: false }, { status: 500 });
  }
}

/** CORS preflight for cross-origin SDK callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
