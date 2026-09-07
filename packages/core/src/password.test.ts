import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password length caps", () => {
  it("hashPassword rejects empty and oversized passwords", async () => {
    await expect(hashPassword("")).rejects.toThrow(/length/);
    await expect(hashPassword("x".repeat(1025))).rejects.toThrow(/length/);
  });

  it("verifyPassword fails closed on oversized input without heavy hashing", async () => {
    const start = Date.now();
    expect(await verifyPassword("not-a-hash", "x".repeat(10_000))).toBe(false);
    expect(await verifyPassword("not-a-hash", "")).toBe(false);
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it("round-trips a normal password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
});
