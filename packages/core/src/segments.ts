/**
 * Whitelist-based audience builder (BUILD-PLAN §4).
 *
 * Rules are stored as JSON and compiled to parameterized SQL against the
 * `subscribers` table (aliased `s`). Unknown fields/operators are rejected —
 * user input can never become dynamic SQL.
 *
 * Shape: { groups: [{ logic: 'AND' | 'OR', conditions: [{ field, op, value }] }] }
 * Groups are AND-joined; conditions inside a group follow the group logic.
 *
 * Allowed fields: url (equals|contains|starts_with|ends_with), country/state
 * (equals|in), device/os/browser (equals|in), subscribed_after/before
 * (gt,gte,lt,lte on subscribe_at), last_active_after (gt,gte on
 * last_active_at), opened_campaign (equals → EXISTS clicked event),
 * campaign_total_opens (gte on click count).
 */

export const SEGMENT_FIELDS = [
  "url",
  "country",
  "state",
  "city",
  "device",
  "os",
  "browser",
  "subscribed_after",
  "subscribed_before",
  "last_active_after",
  "opened_campaign",
  "campaign_total_opens",
  "tag",
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

export const SEGMENT_OPS = [
  "equals",
  "contains",
  "starts_with",
  "ends_with",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
export type SegmentOp = (typeof SEGMENT_OPS)[number];

export interface SegmentCondition {
  field: SegmentField;
  op: SegmentOp;
  /** string|number, or a string[]/number[] for `in` */
  value: string | number | (string | number)[];
}

export interface SegmentGroup {
  /** AND | OR — joins the conditions inside this group */
  logic: "AND" | "OR";
  conditions: SegmentCondition[];
}

export interface SegmentRules {
  groups: SegmentGroup[];
}

/** Which operators are allowed per field (whitelist). */
const FIELD_OPS: Record<SegmentField, readonly SegmentOp[]> = {
  url: ["equals", "contains", "starts_with", "ends_with"],
  country: ["equals", "in"],
  state: ["equals", "in"],
  city: ["equals", "in"],
  device: ["equals", "in"],
  os: ["equals", "in"],
  browser: ["equals", "in"],
  subscribed_after: ["gt", "gte"],
  subscribed_before: ["lt", "lte"],
  last_active_after: ["gt", "gte"],
  opened_campaign: ["equals"],
  campaign_total_opens: ["gte", "gt", "lt", "lte", "equals"],
  tag: ["equals", "in", "contains"],
};

export function isSegmentField(value: unknown): value is SegmentField {
  return typeof value === "string" && (SEGMENT_FIELDS as readonly string[]).includes(value);
}

export function isSegmentOp(value: unknown): value is SegmentOp {
  return typeof value === "string" && (SEGMENT_OPS as readonly string[]).includes(value);
}

/** Validate + normalize a single condition against the whitelist. */
export function normalizeCondition(input: unknown): SegmentCondition | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  if (!isSegmentField(c.field) || !isSegmentOp(c.op)) return null;
  if (!FIELD_OPS[c.field].includes(c.op)) return null;

  const value = c.value;
  if (c.op === "in") {
    if (!Array.isArray(value) || value.length === 0) return null;
    if (!value.every((v) => typeof v === "string" || typeof v === "number")) return null;
    if (value.length > 200) return null; // cap list size (personal: unlocked from 50)
  } else if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  // Timestamps/types sanity: date fields need ISO or epoch ms strings/numbers.
  if (
    c.field === "subscribed_after" ||
    c.field === "subscribed_before" ||
    c.field === "last_active_after" ||
    c.field === "opened_campaign" ||
    c.field === "campaign_total_opens"
  ) {
    if (typeof value === "string" && value.trim() === "") return null;
  }
  return { field: c.field, op: c.op, value };
}

/** Validate + normalize a full ruleset; null when anything is off-whitelist. */
export function normalizeRules(input: unknown): SegmentRules | null {
  if (!input || typeof input !== "object") return null;
  const groups = (input as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return null;
  if (groups.length === 0) return { groups: [] }; // empty = everything
  const out: SegmentGroup[] = [];
  for (const g of groups) {
    if (!g || typeof g !== "object") return null;
    const { logic, conditions } = g as { logic?: unknown; conditions?: unknown };
    if (logic !== "AND" && logic !== "OR") return null;
    if (!Array.isArray(conditions) || conditions.length === 0) return null;
    const normalized: SegmentCondition[] = [];
    for (const c of conditions) {
      const nc = normalizeCondition(c);
      if (!nc) return null;
      normalized.push(nc);
    }
    out.push({ logic, conditions: normalized });
  }
  return { groups: out };
}

/**
 * Compile a ruleset into a parameterized SQL fragment against the
 * `subscribers` table (alias `s`). Params are positional ?N placeholders
 * appended in order to `params`.
 */
export function compileSegmentWhere(rules: SegmentRules, alias = "s"): { sql: string; params: unknown[] } {
  const pieces: string[] = [];
  const params: unknown[] = [];

  for (const group of rules.groups) {
    const clauses: string[] = [];
    for (const cond of group.conditions) {
      clauses.push(compileCondition(cond, alias, params));
    }
    pieces.push(`(${clauses.join(` ${group.logic} `)})`);
  }
  return { sql: pieces.join(" AND "), params };
}

function push(params: unknown[], value: unknown) {
  params.push(value);
  return "?";
}

function compileCondition(cond: SegmentCondition, alias: string, params: unknown[]): string {
  // Subquery-backed fields: opened_campaign / campaign_total_opens / tag (LumaPush city+tag)
  if (cond.field === "opened_campaign") {
    const v = Array.isArray(cond.value) ? cond.value[0] : cond.value;
    const p = push(params, Number(v));
    return `EXISTS (SELECT 1 FROM events e WHERE e.subscriber_id = ${alias}.id AND e.campaign_id = ${p} AND e.type = 'clicked')`;
  }
  if (cond.field === "campaign_total_opens") {
    const v = Array.isArray(cond.value) ? cond.value[0] : cond.value;
    const p = push(params, Number(v));
    const sqlOp = cond.op === "equals" ? "=" : cond.op === "gt" ? ">" : cond.op === "gte" ? ">=" : cond.op === "lt" ? "<" : "<=";
    return `(SELECT COUNT(*) FROM events e WHERE e.subscriber_id = ${alias}.id AND e.campaign_id IS NOT NULL AND e.type = 'clicked') ${sqlOp} ${p}`;
  }
  if (cond.field === "tag") {
    if (cond.op === "in") {
      const list = Array.isArray(cond.value) ? cond.value : [cond.value];
      const ph = list.map((v) => push(params, String(v))).join(", ");
      return `EXISTS (SELECT 1 FROM subscriber_tags t WHERE t.subscriber_id = ${alias}.id AND t.tag IN (${ph}))`;
    }
    if (cond.op === "contains") {
      const escaped = String(cond.value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `EXISTS (SELECT 1 FROM subscriber_tags t WHERE t.subscriber_id = ${alias}.id AND t.tag LIKE ${push(params, `%${escaped}%`)} ESCAPE '\\')`;
    }
    return `EXISTS (SELECT 1 FROM subscriber_tags t WHERE t.subscriber_id = ${alias}.id AND t.tag = ${push(params, String(cond.value))})`;
  }

  const col = scalarColumn(cond.field, alias);

  switch (cond.op) {
    case "equals": {
      return `${col} = ${push(params, cond.value)}`;
    }
    case "contains": {
      const escaped = String(cond.value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `${col} LIKE ${push(params, `%${escaped}%`)} ESCAPE '\\'`;
    }
    case "starts_with": {
      const escaped = String(cond.value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `${col} LIKE ${push(params, `${escaped}%`)} ESCAPE '\\'`;
    }
    case "ends_with": {
      const escaped = String(cond.value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `${col} LIKE ${push(params, `%${escaped}`)} ESCAPE '\\'`;
    }
    case "in": {
      const list = Array.isArray(cond.value) ? cond.value : [cond.value];
      const ph = list.map((v) => push(params, v)).join(", ");
      return `${col} IN (${ph})`;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const sqlOp = cond.op === "gt" ? ">" : cond.op === "gte" ? ">=" : cond.op === "lt" ? "<" : "<=";
      return `${col} ${sqlOp} ${push(params, cond.value)}`;
    }
    default:
      throw new Error(`Unsupported operator: ${cond.op}`);
  }
}

/** Scalar subscriber column for a field (all non-subquery fields). */
function scalarColumn(field: SegmentField, alias: string): string {
  switch (field) {
    case "url":
      return `${alias}.subscribe_url`;
    case "country":
      return `${alias}.country`;
    case "state":
      return `${alias}.state`;
    case "city":
      return `${alias}.city`;
    case "device":
      return `${alias}.device`;
    case "os":
      return `${alias}.os`;
    case "browser":
      return `${alias}.browser`;
    case "subscribed_after":
    case "subscribed_before":
      return `${alias}.subscribe_at`;
    case "last_active_after":
      return `${alias}.last_active_at`;
    default:
      throw new Error(`Unsupported field: ${field}`);
  }
}