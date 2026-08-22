import { corsJson, handlePublicOptions } from "@/lib/cors";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientIp, rateLimitWithHeaders } from "@/lib/rate-limit";
import { domains } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** Public domain info for the SDK — exposes only the VAPID public key. */
export async function GET(req: Request) {
  // Bounded: this endpoint enumerates valid domain ids — don't offer a
  // free scanner.
  const ip = clientIp(req.headers);
  const rl = rateLimitWithHeaders(`info:${ip}`, 60, 60_000);
  if (!rl.allowed) return corsJson({ ok: false, error: "Too many requests" }, { status: 429 });

  const url = new URL(req.url);
  const domainId = Number(url.searchParams.get("domain") ?? 0);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return corsJson({ ok: false, error: "domain param required" }, { status: 400 });
  }
  const [domain] = db
    .select({ publicKey: domains.provider_config_json, status: domains.status })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1)
    .all();
  if (!domain || domain.status !== "active") {
    return corsJson({ ok: false, error: "Unknown domain" }, { status: 404 });
  }
  let publicKey = "";
  try {
    publicKey = domain.publicKey ? (JSON.parse(domain.publicKey) as { publicKey?: string }).publicKey ?? "" : "";
  } catch {
    publicKey = "";
  }
  if (!publicKey) return corsJson({ ok: false, error: "Domain has no VAPID keys" }, { status: 500 });
  return corsJson({ ok: true, publicKey });
}

/** CORS preflight for cross-origin SDK/API callers. */
export async function OPTIONS() {
  return handlePublicOptions();
}
