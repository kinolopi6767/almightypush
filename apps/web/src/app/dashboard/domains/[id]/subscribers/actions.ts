"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { assertPublicHttpUrl, createCipher, csvCell, parseCsv, sha256Hex } from "@pushpanel/core";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";

export type SubscriberActionState =
  | {
      error?: string;
      ok?: boolean;
      imported?: number;
      skipped?: number;
      invalid?: number;
      optedOut?: number;
      deleted?: number;
      csv?: string;
      filename?: string;
    }
  | undefined;

/**
 * Verifies the session and that the domain belongs to the current workspace.
 * Throws/redirects on failure — server actions use this guard directly.
 */
export async function requireOwnedDomain(domainId: number) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const workspaceId = session.user.workspaceId ? Number(session.user.workspaceId) : null;
  if (!workspaceId) redirect("/login");
  const [domain] = db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.id, domainId), eq(domains.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!domain) redirect("/dashboard/domains");
  return { workspaceId, domainId: domain.id };
}

function activeCount(domainId: number): number {
  const row = db
    .select({ value: count() })
    .from(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .get();
  return row?.value ?? 0;
}

export async function unsubscribeSubscriberAction(domainId: number, subscriberId: number): Promise<SubscriberActionState> {
  await requireOwnedDomain(domainId);
  const now = new Date().toISOString();
  const [row] = db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(eq(subscribers.id, subscriberId), eq(subscribers.domain_id, domainId), isNull(subscribers.unsubscribed_at)))
    .limit(1)
    .all();
  if (!row) return { error: "Subscriber not found" };
  db.update(subscribers).set({ unsubscribed_at: now, unsub_reason: "panel" }).where(eq(subscribers.id, row.id)).run();
  db.insert(events).values({ domain_id: domainId, subscriber_id: row.id, type: "unsubscribed" }).run();
  db.update(domains).set({ subscribers_count: activeCount(domainId) }).where(eq(domains.id, domainId)).run();
  revalidatePath(`/dashboard/domains/${domainId}/subscribers`);
  return { ok: true };
}

export async function cleanUnsubscribedAction(domainId: number): Promise<NonNullable<SubscriberActionState>> {
  await requireOwnedDomain(domainId);
  const result = db
    .delete(subscribers)
    .where(and(eq(subscribers.domain_id, domainId), isNotNull(subscribers.unsubscribed_at)))
    .run();
  db.update(domains).set({ subscribers_count: activeCount(domainId) }).where(eq(domains.id, domainId)).run();
  revalidatePath(`/dashboard/domains/${domainId}/subscribers`);
  return { ok: true, deleted: result.changes };
}

export async function exportSubscribersAction(
  domainId: number,
): Promise<NonNullable<SubscriberActionState>> {
  await requireOwnedDomain(domainId);
  const rows = db.select().from(subscribers).where(eq(subscribers.domain_id, domainId)).all();
  const cipher = createCipher(process.env.APP_ENC_KEY);
  // Round-trip guarantee: the import path requires p256dh + auth, so the
  // export must include them or exported files could never be re-imported.
  const header = "id,endpoint,p256dh,auth,browser,os,device,country,state,subscribe_url,subscribe_at,last_active_at,unsubscribed_at,provider";
  const lines = rows.map((s) => {
    let endpoint = "";
    let p256dh = "";
    let auth = "";
    if (s.token) {
      try {
        const parsed = JSON.parse(cipher.decrypt(s.token)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        endpoint = parsed.endpoint ?? "";
        p256dh = parsed.keys?.p256dh ?? "";
        auth = parsed.keys?.auth ?? "";
      } catch {
        endpoint = "";
      }
    }
    return [
      s.id,
      csvCell(endpoint),
      csvCell(p256dh),
      csvCell(auth),
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
    ].join(",");
  });
  const csv = [header, ...lines].join("\n");
  return { ok: true, csv, filename: `subscribers-domain-${domainId}-${Date.now()}.csv` };
}

const IMPORT_LINE_LIMIT = 100_000; // personal: unlocked from 5k

export async function importSubscribersAction(
  domainId: number,
  _prev: SubscriberActionState,
  formData: FormData,
): Promise<NonNullable<SubscriberActionState>> {
  await requireOwnedDomain(domainId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to import" };
  const text = (await file.text()).slice(0, 10_000_000); // personal: unlocked from 2M

  const parsed: { endpoint?: string; p256dh?: string; auth?: string; browser?: string; os?: string; device?: string; subscribe_url?: string; provider?: string }[] = [];

  // Accepts three shapes: JSON array (`[...]`), one pretty-printed JSON
  // object, or JSONL (one object per line). Anything else falls back to CSV.
  const pushRow = (item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const src = item as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));
    parsed.push({
      endpoint: str(src.endpoint),
      p256dh: str(src.p256dh),
      auth: str(src.auth),
      browser: str(src.browser),
      os: str(src.os),
      device: str(src.device),
      subscribe_url: str(src.subscribe_url),
      provider: str(src.provider),
    });
  };

  try {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    const firstChar = firstLine.trim()[0];
    if (firstChar === "[") {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (parsed.length >= IMPORT_LINE_LIMIT) break;
          pushRow(item);
        }
      }
    } else if (firstChar === "{") {
      try {
        const single = JSON.parse(text) as unknown;
        if (Array.isArray(single)) {
          for (const item of single) {
            if (parsed.length >= IMPORT_LINE_LIMIT) break;
            pushRow(item);
          }
        } else {
          pushRow(single);
        }
      } catch {
        // not a single JSON document — fall through to JSONL
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (parsed.length >= IMPORT_LINE_LIMIT) break;
          try {
            pushRow(JSON.parse(trimmed) as unknown);
          } catch {
            // skip malformed line
          }
        }
      }
    } else {
      const rows = parseCsv(text);
      const [headerRow, ...body] = rows;
      if (!headerRow) return { error: "File is empty" };
      const cols = headerRow.map((c) => c.trim().toLowerCase());
      const idx = (name: string) => cols.indexOf(name);
      const cell = (row: string[], name: string) => {
        const i = idx(name);
        if (i < 0) return undefined;
        const raw = (row[i] ?? "").trim();
        // Symmetric with csvCell's formula-injection guard: exported cells
        // that started with [=+-@] gained a leading apostrophe — strip
        // exactly one so export→import round-trips byte-identically.
        return raw.startsWith("'") ? raw.slice(1) : raw;
      };
      for (const line of body) {
        if (line.every((c) => c === "")) continue;
        if (parsed.length >= IMPORT_LINE_LIMIT) break;
        parsed.push({
          endpoint: cell(line, "endpoint"),
          p256dh: cell(line, "p256dh"),
          auth: cell(line, "auth"),
          browser: cell(line, "browser"),
          os: cell(line, "os"),
          device: cell(line, "device"),
          subscribe_url: cell(line, "subscribe_url"),
          provider: cell(line, "provider"),
        });
      }
    }
  } catch {
    return { error: "Could not read the file" };
  }

  const cipher = createCipher(process.env.APP_ENC_KEY);
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  let optedOut = 0;

  const valid = (v: string | undefined): v is string => typeof v === "string" && v.trim().length > 0;

  for (const row of parsed) {
    if (!valid(row.endpoint) || !valid(row.p256dh) || !valid(row.auth)) {
      invalid += 1;
      continue;
    }
    let url: URL;
    try {
      url = new URL(row.endpoint);
    } catch {
      invalid += 1;
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) {
      invalid += 1;
      continue;
    }
    // SSRF guard — imports ingest third-party lists; the worker will POST to
    // these endpoints from the server, so apply the same discipline as the
    // live subscribe API (private/link-local/metadata addresses rejected).
    const ssrf = await assertPublicHttpUrl(row.endpoint);
    if (!ssrf.ok) {
      invalid += 1;
      continue;
    }
    const tokenHash = sha256Hex(row.endpoint);
    // Dedupe on token_hash REGARDLESS of unsubscribed status: re-importing
    // your own export must never resurrect opt-outs (consent/GDPR).
    const existing = db
      .select({ id: subscribers.id, unsubscribed_at: subscribers.unsubscribed_at })
      .from(subscribers)
      .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, tokenHash)))
      .limit(1)
      .get();
    if (existing) {
      if (existing.unsubscribed_at) optedOut += 1;
      else skipped += 1;
      continue;
    }
    db.insert(subscribers)
      .values({
        domain_id: domainId,
        token: cipher.encrypt(JSON.stringify({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })),
        token_hash: tokenHash,
        provider: row.provider?.trim() || "vapid",
        browser: row.browser?.trim() || null,
        os: row.os?.trim() || null,
        device: row.device?.trim() || null,
        subscribe_url: row.subscribe_url?.trim() || null,
        subscribe_at: now,
        last_active_at: now,
      })
      .run();
    imported += 1;
  }

  db.update(domains).set({ subscribers_count: activeCount(domainId) }).where(eq(domains.id, domainId)).run();
  revalidatePath(`/dashboard/domains/${domainId}/subscribers`);
  return { ok: true, imported, skipped, invalid, optedOut };
}
