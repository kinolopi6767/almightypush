import { describe, expect, it } from "vitest";
import { nextCronRun, hasCronSchedule, parseAutomationConfig } from "./automation";

function atLocal(y: number, mo: number, d: number, h: number, mi = 0, s = 0): Date {
  return new Date(y, mo - 1, d, h, mi, s);
}

// crontab semantics are server-local time, like real cron — assertions use
// locally constructed dates so they hold under any process TZ.
describe("nextCronRun", () => {
  it("returns the next occurrence strictly after the reference time", () => {
    const next = nextCronRun("0 9 * * *", atLocal(2026, 1, 1, 0, 0, 0))!;
    expect(next.getTime()).toBe(atLocal(2026, 1, 1, 9).getTime());
  });

  it("handles multi-value fields and crosses into the next day", () => {
    expect(nextCronRun("0 8,17 * * *", atLocal(2026, 1, 1, 10))!.getTime()).toBe(atLocal(2026, 1, 1, 17).getTime());
    expect(nextCronRun("0 8 * * *", atLocal(2026, 1, 1, 10))!.getTime()).toBe(atLocal(2026, 1, 2, 8).getTime());
  });

  it("moves past a reference sitting exactly on a scheduled time", () => {
    expect(nextCronRun("30 * * * *", atLocal(2026, 1, 1, 10, 30))!.getTime()).toBe(atLocal(2026, 1, 1, 11, 30).getTime());
  });

  it("honors weekday restrictions (0=Sunday, 6=Saturday)", () => {
    const fromFri = atLocal(2026, 1, 2, 0, 0, 0); // a Friday, before 09:00
    expect(nextCronRun("0 9 * * 5", fromFri)!.getDay()).toBe(5);
    expect(nextCronRun("0 9 * * 1", atLocal(2026, 1, 1, 0))!.getDay()).toBe(1);
  });

  it("supports step and list syntax", () => {
    expect(nextCronRun("*/30 * * * *", atLocal(2026, 1, 1, 0))!.getMinutes() % 30).toBe(0);
    expect(nextCronRun("0 9,21 * * *", atLocal(2026, 1, 1, 22))!.getTime()).toBe(atLocal(2026, 1, 2, 9).getTime());
  });

  it("returns null for invalid or never-firing expressions", () => {
    expect(nextCronRun("", atLocal(2026, 1, 1))).toBeNull();
    expect(nextCronRun("not a cron", atLocal(2026, 1, 1))).toBeNull();
    expect(nextCronRun("0 0 30 2 *", atLocal(2026, 1, 1))).toBeNull(); // Feb 30 never exists
    expect(nextCronRun("0 13 0 * *", atLocal(2026, 1, 1))).toBeNull(); // impossible hour
  });
});

describe("drip steps (C8)", () => {
  it("parses steps with cumulative delays and payloads", () => {
    const config = parseAutomationConfig(
      JSON.stringify({
        payload: { title: "x" },
        steps: [
          { delay_days: 0, title: "Welcome" },
          { delay_days: 3, title: "Tip", message: "Try this", launch_url: "https://a.example.com" },
        ],
      }),
    );
    expect(config.steps).toHaveLength(2);
    expect(config.steps![0]!.delay_days).toBe(0);
    expect(config.steps![1]!.launch_url).toBe("https://a.example.com");
  });

  it("rejects more than the step cap and invalid delays", () => {
    const tooMany = parseAutomationConfig(JSON.stringify({ payload: { title: "x" }, steps: Array.from({ length: 11 }, () => ({ delay_days: 1, title: "s" })) }));
    expect(tooMany.steps).toBeUndefined();
    const bad = parseAutomationConfig(JSON.stringify({ payload: { title: "x" }, steps: [{ delay_days: -1, title: "s" }] }));
    expect(bad.steps).toBeUndefined();
  });
});