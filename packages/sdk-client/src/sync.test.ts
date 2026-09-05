import { describe, expect, it } from "vitest";
import { shouldPeriodicSync, syncThrottleKey, SYNC_THROTTLE_INTERVAL_MS } from "./index";

describe("per-domain periodic sync throttle", () => {
  it("keys throttle storage per domain", () => {
    expect(syncThrottleKey(1)).toBe("__pushpanel_last_sync___1");
    expect(syncThrottleKey(2)).toBe("__pushpanel_last_sync___2");
    expect(syncThrottleKey(1)).not.toBe(syncThrottleKey(2));
  });

  it("syncs when never synced before", () => {
    expect(shouldPeriodicSync(0)).toBe(true);
    expect(shouldPeriodicSync(Number.NaN)).toBe(true);
  });

  it("throttles within the 12h window", () => {
    const now = 1_800_000_000_000;
    expect(shouldPeriodicSync(now - 60_000, now)).toBe(false);
    expect(shouldPeriodicSync(now - SYNC_THROTTLE_INTERVAL_MS + 1, now)).toBe(false);
  });

  it("re-syncs once the window elapses", () => {
    const now = 1_800_000_000_000;
    expect(shouldPeriodicSync(now - SYNC_THROTTLE_INTERVAL_MS, now)).toBe(true);
    expect(shouldPeriodicSync(now - SYNC_THROTTLE_INTERVAL_MS - 1, now)).toBe(true);
  });
});
