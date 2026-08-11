import { and, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { subscribers } from "@pushpanel/db/schema";

/**
 * E2: advanced subscriber analytics filters — date range + location +
 * device/browser/os. Shared by the analytics page and the CSV export so
 * both surfaces always agree on what "filtered" means.
 */

export interface SubscriberFilter {
  domainId?: number;
  from?: string; // YYYY-MM-DD (inclusive, based on subscribe_at)
  to?: string;
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
  state?: string;
  showOnly: "active" | "unsubscribed" | "all";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export function parseSubscriberFilterValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value === undefined || value === "" ? undefined : value;
}

const FILTER_KEYS = ["device", "browser", "os", "country", "state"] as const;

export function parseSubscriberFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): SubscriberFilter {
  const get = (k: string): string | undefined =>
    parseSubscriberFilterValue(params instanceof URLSearchParams ? params.get(k) ?? undefined : params[k]);
  const filter: SubscriberFilter = { showOnly: "all" };
  const domainId = get("domain");
  if (domainId && /^\d+$/.test(domainId)) filter.domainId = Number(domainId);
  const from = get("from");
  if (from && DATE_RE.test(from)) filter.from = from;
  const to = get("to");
  if (to && DATE_RE.test(to)) filter.to = to;
  for (const key of FILTER_KEYS) {
    const v = get(key);
    if (v) filter[key] = v;
  }
  const show = get("show") as SubscriberFilter["showOnly"] | undefined;
  if (show === "active" || show === "unsubscribed") filter.showOnly = show;
  return filter;
}

/** SQLite conditions for a filter, scoped to the caller's workspace. */
export function subscriberConditions(
  filter: SubscriberFilter,
  workspaceId: number,
  exclude?: (typeof FILTER_KEYS)[number],
): SQL[] {
  const conds: SQL[] = [
    sql`${subscribers.domain_id} IN (SELECT id FROM domains WHERE workspace_id = ${workspaceId})`,
  ];
  if (filter.domainId) conds.push(eq(subscribers.domain_id, filter.domainId));
  if (filter.from) conds.push(sql`date(${subscribers.subscribe_at}) >= ${filter.from}`);
  if (filter.to) conds.push(sql`date(${subscribers.subscribe_at}) <= ${filter.to}`);
  for (const key of FILTER_KEYS) {
    if (filter[key] && key !== exclude) conds.push(eq(subscribers[key], filter[key]));
  }
  if (filter.showOnly === "active") conds.push(isNull(subscribers.unsubscribed_at));
  if (filter.showOnly === "unsubscribed") conds.push(sql`${subscribers.unsubscribed_at} IS NOT NULL`);
  return conds;
}

export function subscriberAnd(filter: SubscriberFilter, workspaceId: number): SQL {
  return and(...subscriberConditions(filter, workspaceId))!;
}