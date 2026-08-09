import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains } from "@pushpanel/db/schema";

export const dynamic = "force-dynamic";

/** Public domain info for the SDK — exposes only the VAPID public key. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const domainId = Number(url.searchParams.get("domain") ?? 0);
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return NextResponse.json({ ok: false, error: "domain param required" }, { status: 400 });
  }
  const [domain] = db
    .select({ publicKey: domains.provider_config_json, status: domains.status })
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1)
    .all();
  if (!domain || domain.status !== "active") {
    return NextResponse.json({ ok: false, error: "Unknown domain" }, { status: 404 });
  }
  let publicKey = "";
  try {
    publicKey = domain.publicKey ? (JSON.parse(domain.publicKey) as { publicKey?: string }).publicKey ?? "" : "";
  } catch {
    publicKey = "";
  }
  if (!publicKey) return NextResponse.json({ ok: false, error: "Domain has no VAPID keys" }, { status: 500 });
  return NextResponse.json({ ok: true, publicKey });
}
