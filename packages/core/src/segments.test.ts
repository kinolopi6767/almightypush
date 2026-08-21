import { describe, expect, it } from "vitest";
import {
  compileSegmentWhere,
  normalizeCondition,
  normalizeRules,
  type SegmentRules,
} from "./segments";

describe("normalizeCondition", () => {
  it("accepts whitelisted fields with valid ops", () => {
    expect(normalizeCondition({ field: "country", op: "equals", value: "US" })).toEqual({
      field: "country",
      op: "equals",
      value: "US",
    });
  });

  it("rejects unknown fields", () => {
    expect(normalizeCondition({ field: "email", op: "equals", value: "a" })).toBeNull();
  });

  it("rejects unknown operators", () => {
    expect(normalizeCondition({ field: "country", op: "regex", value: "a" })).toBeNull();
  });

  it("rejects ops not allowed for a field", () => {
    // contains is only allowed on url fields
    expect(normalizeCondition({ field: "country", op: "contains", value: "US" })).toBeNull();
  });

  it("rejects empty in-lists", () => {
    expect(normalizeCondition({ field: "country", op: "in", value: [] })).toBeNull();
  });

  it("caps in-list size", () => {
    expect(
      normalizeCondition({ field: "country", op: "in", value: Array.from({ length: 201 }, (_, i) => `C${i}`) }),
    ).toBeNull();
  });
});

describe("normalizeRules", () => {
  it("normalizes a full ruleset", () => {
    const rules = normalizeRules({
      groups: [
        { logic: "AND", conditions: [{ field: "country", op: "equals", value: "US" }] },
        { logic: "OR", conditions: [{ field: "browser", op: "equals", value: "chrome" }] },
      ],
    });
    expect(rules?.groups).toHaveLength(2);
  });

  it("rejects unknown field inside a group", () => {
    expect(
      normalizeRules({
        groups: [{ logic: "AND", conditions: [{ field: "evil", op: "equals", value: "x" }] }],
      }),
    ).toBeNull();
  });

  it("allows empty groups = match everyone", () => {
    expect(normalizeRules({ groups: [] })).toEqual({ groups: [] });
  });
});

describe("compileSegmentWhere", () => {
  it("compiles equals with positional params", () => {
    const { sql, params } = compileSegmentWhere({ groups: [{ logic: "AND", conditions: [{ field: "country", op: "equals", value: "US" }] }] });
    expect(sql).toBe("(s.country = ?)");
    expect(params).toEqual(["US"]);
  });

  it("compiles LIKE with escaping", () => {
    const { sql, params } = compileSegmentWhere({
      groups: [{ logic: "AND", conditions: [{ field: "url", op: "contains", value: "100%" }] }],
    });
    expect(sql).toBe("(s.subscribe_url LIKE ? ESCAPE '\\')");
    expect(params).toEqual(["%100\\%%"]);
  });

  it("compiles in-lists one placeholder per item", () => {
    const { sql, params } = compileSegmentWhere({
      groups: [{ logic: "AND", conditions: [{ field: "device", op: "in", value: ["android", "iphone"] }] }],
    });
    expect(sql).toBe("(s.device IN (?, ?))");
    expect(params).toEqual(["android", "iphone"]);
  });

  it("joins groups with AND and conditions with the group logic", () => {
    const rules: SegmentRules = {
      groups: [
        { logic: "OR", conditions: [{ field: "os", op: "equals", value: "ios" }, { field: "os", op: "equals", value: "android" }] },
        { logic: "AND", conditions: [{ field: "subscribed_after", op: "gte", value: "2026-01-01" }] },
      ],
    };
    const { sql, params } = compileSegmentWhere(rules);
    expect(sql).toBe("(s.os = ? OR s.os = ?) AND (s.subscribe_at >= ?)");
    expect(params).toEqual(["ios", "android", "2026-01-01"]);
  });

  it("compiles opened_campaign as EXISTS over clicked events", () => {
    const { sql, params } = compileSegmentWhere({
      groups: [{ logic: "AND", conditions: [{ field: "opened_campaign", op: "equals", value: 42 }] }],
    });
    expect(sql).toContain("EXISTS (SELECT 1 FROM events e");
    expect(sql).toContain("e.campaign_id = ?");
    expect(params).toEqual([42]);
  });

  it("compiles campaign_total_opens as a count subquery", () => {
    const { sql, params } = compileSegmentWhere({
      groups: [{ logic: "AND", conditions: [{ field: "campaign_total_opens", op: "gte", value: 3 }] }],
    });
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain(">= ?");
    expect(params).toEqual([3]);
  });

  it("rejects unsupported field at compile time", () => {
    expect(() =>
      compileSegmentWhere({
        groups: [{ logic: "AND", conditions: [{ field: "url", op: "equals", value: "x" }] }],
      }),
    ).not.toThrow();
  });
});
