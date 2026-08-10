import { describe, expect, it } from "vitest";
import { nextPollMs } from "../src/poll";

describe("nextPollMs adaptive cadence", () => {
  it("polls fast while work is pending", () => {
    expect(nextPollMs(true, 5_000, 60_000)).toBe(5_000);
  });

  it("falls back to a sparse idle poll when nothing ran", () => {
    expect(nextPollMs(false, 5_000, 60_000)).toBe(60_000);
  });

  it("never idles slower than the configured floor", () => {
    expect(nextPollMs(false, 1_000, 1_000)).toBe(1_000);
  });
});