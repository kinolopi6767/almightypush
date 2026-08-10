import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import { compileSegmentWhere, normalizeRules, type SegmentRules } from "@pushpanel/core";
import { segments, subscribers } from "../schema";
import type { allTables } from "../schema";
import type { PushDb } from "./automation";

export type { PushDb };

/** The drizzle factory also exposes the raw better-sqlite3 client. */
type WithClient = PushDb & { $client: Database.Database };

export interface ResolveSegmentOptions {
  db: PushDb;
  workspaceId: number;
  segmentId: number;
  /** Scope to a specific campaign domain */
  domainId?: number;
}

export interface SegmentMatch {
  subscriberIds: number[];
  count: number;
}

/**
 * Resolve a saved segment to active subscriber ids. Domain filtering uses the
 * segment's `domain_ids_json` (NULL = all domains of the workspace),
 * intersected with `options.domainId` when the campaign targets one domain.
 */
export function resolveSegment(db: PushDb, opts: ResolveSegmentOptions): SegmentMatch {
  const [row] = db
    .select({
      domain_ids_json: segments.domain_ids_json,
      conditions_json: segments.conditions_json,
    })
    .from(segments)
    .where(and(eq(segments.id, opts.segmentId), eq(segments.workspace_id, opts.workspaceId)))
    .limit(1)
    .all();
  if (!row) return { subscriberIds: [], count: 0 };

  const rules = parseRules(row.conditions_json);
  const domainFilter = parseDomainFilter(row.domain_ids_json, opts.domainId);
  return resolveSubscribers(db, rules, domainFilter);
}

/** Estimate the size of arbitrary rules without persisting a segment. */
export function estimateSegmentRules(db: PushDb, rules: SegmentRules, domainIds?: number[]): number {
  return resolveSubscribers(db, rules, domainIds ?? null).count;
}

/**
 * Refresh a saved segment's `estimate_count` / `estimate_at`. Call after
 * create/update and on a schedule.
 */
export function refreshSegmentEstimate(db: PushDb, segmentId: number, workspaceId: number): void {
  const [row] = db
    .select({
      domain_ids_json: segments.domain_ids_json,
      conditions_json: segments.conditions_json,
    })
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.workspace_id, workspaceId)))
    .limit(1)
    .all();
  if (!row) return;
  const rules = parseRules(row.conditions_json);
  const count = resolveSubscribers(db, rules, parseDomainFilter(row.domain_ids_json)).count;
  db.update(segments)
    .set({ estimate_count: count, estimate_at: new Date().toISOString() })
    .where(eq(segments.id, segmentId))
    .run();
}

function resolveSubscribers(db: PushDb, rules: SegmentRules, domainIds: number[] | null): SegmentMatch {
  const conds: string[] = ["s.unsubscribed_at IS NULL"];
  const params: unknown[] = [];
  if (domainIds && domainIds.length > 0) {
    conds.push(`s.domain_id IN (${domainIds.map(() => "?").join(", ")})`);
    params.push(...domainIds);
  }
  const compiled = compileSegmentWhere(rules, "s");
  if (compiled.sql) conds.push(`(${compiled.sql})`);
  params.push(...compiled.params);

  const rows = ((db as WithClient).$client
    .prepare(`SELECT s.id FROM subscribers s WHERE ${conds.join(" AND ")}`)
    .all(...params) as { id: number }[]);
  return { subscriberIds: rows.map((r) => r.id), count: rows.length };
}

function parseDomainFilter(json: string | null, override?: number): number[] | null {
  let fromStore: number[] | null = null;
  try {
    const parsed = json ? JSON.parse(json) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      fromStore = parsed.map(Number).filter((n) => Number.isInteger(n));
    }
  } catch {
    fromStore = null;
  }
  if (override) {
    return fromStore ? fromStore.filter((id) => id === override) : [override];
  }
  return fromStore;
}

function parseRules(json: string): SegmentRules {
  try {
    const rules = normalizeRules(JSON.parse(json));
    if (rules) return rules;
  } catch {
    // fall through to empty
  }
  return { groups: [] };
}