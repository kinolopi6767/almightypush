import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/index.js";

describe("password hashing (argon2id)", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects wrong passwords", async () => {
    const hash = await hashPassword("secret-1");
    expect(await verifyPassword(hash, "secret-2")).toBe(false);
  });

  it("rejects garbage hashes without throwing", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });
});