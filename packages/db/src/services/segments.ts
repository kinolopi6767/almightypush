import { and, eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import { compileSegmentWhere, normalizeRules, type SegmentRules } from "@pushpanel/core";
import { segments } from "../schema";
import type { PushDb } from "./automation";

export type { PushDb };

/** The drizzle factory also exposes the raw better-sqlite3 client. */
type WithClient = PushDb & { $client: Database.Database };

export interface ResolveSegmentOptions {
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
  return resolveSubscribers(db, opts.workspaceId, rules, domainFilter);
}

/** Estimate the size of arbitrary rules without persisting a segment. */
export function estimateSegmentRules(db: PushDb, workspaceId: number, rules: SegmentRules, domainIds?: number[]): number {
  return countSubscribers(db, workspaceId, rules, domainIds ?? null);
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
  const count = countSubscribers(db, workspaceId, rules, parseDomainFilter(row.domain_ids_json));
  db.update(segments)
    .set({ estimate_count: count, estimate_at: new Date().toISOString() })
    .where(eq(segments.id, segmentId))
    .run();
}

/**
 * Shared WHERE builder for segment queries — enforces workspace isolation.
 * A segment can never match subscribers outside its own workspace, even when
 * no domain ids are stored (NULL domain_ids_json means "all domains of the
 * workspace", not "all domains everywhere").
 */
function buildSegmentWhere(workspaceId: number, rules: SegmentRules | null, domainIds: number[] | null): { where: string; params: unknown[] } {
  const conds: string[] = [
    "s.unsubscribed_at IS NULL",
    "s.domain_id IN (SELECT id FROM domains WHERE workspace_id = ?)",
  ];
  const params: unknown[] = [workspaceId];
  if (domainIds && domainIds.length > 0) {
    conds.push(`s.domain_id IN (${domainIds.map(() => "?").join(", ")})`);
    params.push(...domainIds);
  }
  // Fail closed: corrupt/off-whitelist rules must match NOTHING, never the
  // whole workspace (previous code returned {groups:[]} = match-everything).
  if (rules === null) {
    conds.push("1 = 0");
    return { where: conds.join(" AND "), params };
  }
  const compiled = compileSegmentWhere(rules, "s");
  if (compiled.sql) conds.push(`(${compiled.sql})`);
  params.push(...compiled.params);
  return { where: conds.join(" AND "), params };
}

function resolveSubscribers(db: PushDb, workspaceId: number, rules: SegmentRules | null, domainIds: number[] | null): SegmentMatch {
  const { where, params } = buildSegmentWhere(workspaceId, rules, domainIds);
  const rows = ((db as WithClient).$client.prepare(`SELECT s.id FROM subscribers s WHERE ${where}`).all(...params) as { id: number }[]);
  return { subscriberIds: rows.map((r) => r.id), count: rows.length };
}

function countSubscribers(db: PushDb, workspaceId: number, rules: SegmentRules | null, domainIds: number[] | null): number {
  const { where, params } = buildSegmentWhere(workspaceId, rules, domainIds);
  const row = ((db as WithClient).$client.prepare(`SELECT COUNT(*) as cnt FROM subscribers s WHERE ${where}`).get(...params) as { cnt: number } | undefined);
  return row?.cnt ?? 0;
}

function parseDomainFilter(json: string | null, override?: number): number[] | null {
  let fromStore: number[] | null = null;
  try {
    const parsed = json ? JSON.parse(json) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Positive integers only: 0/negatives/NaN match nothing downstream, so
      // reject them here instead of emitting dead IN-list entries.
      fromStore = parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (fromStore.length === 0) {
        // Invalid stored filter must fail CLOSED (match nothing), never broaden
        // to "no filter" (whole workspace). Use the impossible-id sentinel.
        return [-1];
      }
    }
  } catch {
    // Corrupt filter JSON: fail closed, not broad.
    return [-1];
  }
  if (override) {
    // Disjoint intersection must match NOTHING — returning [] would be
    // treated as "no filter" downstream and match the whole workspace.
    // [-1] is the explicit impossible-domain sentinel (real ids are >0).
    if (fromStore) {
      const hit = fromStore.filter((id) => id === override);
      return hit.length > 0 ? hit : [-1];
    }
    return [override];
  }
  return fromStore;
}

function parseRules(json: string): SegmentRules | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Corrupt JSON: fail closed to match-nothing.
    return null;
  }
  const rules = normalizeRules(parsed);
  if (rules) {
    // Fail-closed: an explicitly empty ruleset ({groups:[]}) means "all
    // subscribers" ONLY when stored intentionally. A group with ZERO
    // conditions is never valid (normalizeRules rejects it) — a UI bug saving
    // empty conditions must NOT mass-send to the workspace. Since
    // normalizeRules already returned non-null here, groups are well-formed.
    return rules;
  }
  // Fail closed: invalid/off-whitelist segment JSON matches nothing.
  // NOTE: legacy compat that mapped empty-condition groups to {groups:[]}
  // (match-everything) was REMOVED — it turned a UI save bug into a
  // workspace-wide mass-send. Empty conditions now match nothing.
  return null;
}