import { describe, expect, it, vi } from "vitest";
import { logAdminAction, logAdminError, logger } from "@/lib/logger";

describe("structured panel logger", () => {
  it("never throws on hostile input", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => logger.info("hi", { meta: { a: 1 } as never })).not.toThrow();
    expect(() =>
      logger.error("boom", { error: Object.create(null), workspaceId: 1, action: "x" }),
    ).not.toThrow();
    expect(() => logAdminAction("campaign.create", { workspaceId: 7 })).not.toThrow();
    expect(() => logAdminError("backup.create", new Error("disk full"), {})).not.toThrow();
    errSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it("measure() logs duration and returns the value", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const out = await logger.measure("op", async () => 42, { workspaceId: 3 });
    expect(out).toBe(42);
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(String(infoSpy.mock.calls[0]?.[0])).toContain("ws=3");
    infoSpy.mockRestore();
  });

  it("measure() logs failures and rethrows", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      logger.measure(
        "op",
        async () => {
          throw new Error("nope");
        },
        { action: "test" },
      ),
    ).rejects.toThrow("nope");
    expect(errSpy).toHaveBeenCalledOnce();
    errSpy.mockRestore();
  });
});
