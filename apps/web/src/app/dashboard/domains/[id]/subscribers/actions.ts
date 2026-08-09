"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createCipher, sha256Hex } from "@pushpanel/core";
import { domains, events, subscribers } from "@pushpanel/db/schema";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";

export type SubscriberActionState =
  | {
      error?: string;
      ok?: boolean;
      imported?: number;
      skipped?: number;
      invalid?: number;
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
  const header = "id,endpoint,browser,os,device,country,state,subscribe_url,subscribe_at,last_active_at,unsubscribed_at";
  const lines = rows.map((s) => {
    let endpoint = "";
    if (s.token) {
      try {
        endpoint = (JSON.parse(cipher.decrypt(s.token)) as { endpoint?: string }).endpoint ?? "";
      } catch {
        endpoint = "";
      }
    }
    const csvCell = (v: string | null | undefined) => {
      const str = v ?? "";
      return `"${str.replace(/"/g, '""')}"`;
    };
    return [
      s.id,
      csvCell(endpoint),
      csvCell(s.browser),
      csvCell(s.os),
      csvCell(s.device),
      csvCell(s.country),
      csvCell(s.state),
      csvCell(s.subscribe_url),
      csvCell(s.subscribe_at),
      csvCell(s.last_active_at),
      csvCell(s.unsubscribed_at),
    ].join(",");
  });
  const csv = [header, ...lines].join("\n");
  return { ok: true, csv, filename: `subscribers-domain-${domainId}-${Date.now()}.csv` };
}

const IMPORT_LINE_LIMIT = 5_000;

export async function importSubscribersAction(
  domainId: number,
  _prev: SubscriberActionState,
  formData: FormData,
): Promise<NonNullable<SubscriberActionState>> {
  await requireOwnedDomain(domainId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to import" };
  const text = (await file.text()).slice(0, 2_000_000);

  const parsed: { endpoint?: string; p256dh?: string; auth?: string; browser?: string; os?: string; device?: string; subscribe_url?: string }[] = [];
  try {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
    if (firstLine.trim().startsWith("{")) {
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (parsed.length >= IMPORT_LINE_LIMIT) break;
        try {
          parsed.push(JSON.parse(trimmed) as (typeof parsed)[number]);
        } catch {
          // skip malformed line
        }
      }
    } else {
      const [header, ...rows] = text.split(/\r?\n/);
      if (!header) return { error: "File is empty" };
      const cols = header.split(",").map((c) => c.trim().toLowerCase());
      const idx = (name: string) => cols.indexOf(name);
      const get = (row: string[], name: string) => {
        const i = idx(name);
        if (i < 0) return undefined;
        const cell = row[i] ?? "";
        return cell.startsWith('"') && cell.endsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
      };
      for (const line of rows) {
        if (!line.trim() || parsed.length >= IMPORT_LINE_LIMIT) continue;
        parsed.push({
          endpoint: get(line.split(","), "endpoint"),
          p256dh: get(line.split(","), "p256dh"),
          auth: get(line.split(","), "auth"),
          browser: get(line.split(","), "browser"),
          os: get(line.split(","), "os"),
          device: get(line.split(","), "device"),
          subscribe_url: get(line.split(","), "subscribe_url"),
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
    const tokenHash = sha256Hex(row.endpoint);
    const existing = db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(and(eq(subscribers.domain_id, domainId), eq(subscribers.token_hash, tokenHash), isNull(subscribers.unsubscribed_at)))
      .limit(1)
      .get();
    if (existing) {
      skipped += 1;
      continue;
    }
    db.insert(subscribers)
      .values({
        domain_id: domainId,
        token: cipher.encrypt(JSON.stringify({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })),
        token_hash: tokenHash,
        provider: "vapid",
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
  return { ok: true, imported, skipped, invalid };
}
