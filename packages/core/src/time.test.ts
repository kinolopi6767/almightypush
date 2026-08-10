import { describe, expect, it } from "vitest";
import { naiveLocalToUtcMs } from "./time";

const wall = "2026-07-01T12:30";

describe("naiveLocalToUtcMs", () => {
  it("treats a missing timezone as server-local (Date.parse semantics)", () => {
    const expected = new Date(wall).getTime();
    expect(naiveLocalToUtcMs(wall)).toBe(expected);
  });

  it("interprets the wall clock in UTC", () => {
    const utc = naiveLocalToUtcMs(wall, "UTC");
    expect(new Date(utc).toISOString()).toBe("2026-07-01T12:30:00.000Z");
  });

  it("interprets the wall clock in positive-offset zones (Tokyo, UTC+9)", () => {
    const tokyo = naiveLocalToUtcMs(wall, "Asia/Tokyo");
    expect(new Date(tokyo).toISOString()).toBe("2026-07-01T03:30:00.000Z");
  });

  it("interprets the wall clock in negative-offset zones (New York, EDT = UTC-4)", () => {
    const ny = naiveLocalToUtcMs(wall, "America/New_York");
    expect(new Date(ny).toISOString()).toBe("2026-07-01T16:30:00.000Z");
  });

  it("handles DST: February (EST, UTC-5) vs July (EDT, UTC-4) differ by one hour", () => {
    const feb = naiveLocalToUtcMs("2026-02-01T12:30", "America/New_York");
    const jul = naiveLocalToUtcMs("2026-07-01T12:30", "America/New_York");
    expect(new Date(feb).toISOString()).toBe("2026-02-01T17:30:00.000Z");
    expect(new Date(jul).toISOString()).toBe("2026-07-01T16:30:00.000Z");
  });

  it("handles half-hour and quarter-hour offsets", () => {
    expect(new Date(naiveLocalToUtcMs("2026-07-01T12:30", "Asia/Kolkata")).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(new Date(naiveLocalToUtcMs("2026-07-01T12:30", "Asia/Kathmandu")).toISOString()).toBe("2026-07-01T06:45:00.000Z");
  });

  it("returns NaN for unparseable input", () => {
    expect(Number.isNaN(naiveLocalToUtcMs("not-a-date", "UTC"))).toBe(true);
  });

  it("round-trips: the timezone shows the original wall clock", () => {
    const input = "2026-12-01T23:15";
    const utc = naiveLocalToUtcMs(input, "Europe/Berlin");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utc))
      .reduce<Record<string, string>>((m, p) => {
        m[p.type] = p.value;
        return m;
      }, {});
    expect(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`).toBe(input);
  });
});