import { describe, expect, it } from "vitest";
import { createCipher, safeEqual, sha256Hex } from "../src/index.js";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex chars

describe("crypto", () => {
  it("encrypts and decrypts round-trip", () => {
    const c = createCipher(KEY);
    const secret = "fcm-service-account-json{...}";
    const enc = c.encrypt(secret);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(c.decrypt(enc)).toBe(secret);
  });

  it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
    const c = createCipher(KEY);
    expect(c.encrypt("same")).not.toBe(c.encrypt("same"));
  });

  it("requires a valid 64-hex key", () => {
    expect(() => createCipher("short")).toThrow(/APP_ENC_KEY/);
  });

  it("rejects tampered payloads", () => {
    const c = createCipher(KEY);
    const enc = c.encrypt("data");
    const parts = enc.split(":");
    const tampered = [...parts.slice(0, -1), Buffer.from("AAAA").toString("base64")].join(":");
    expect(() => c.decrypt(tampered)).toThrow();
  });
});

describe("sha256Hex + safeEqual", () => {
  it("hashes deterministically", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).toHaveLength(64);
  });

  it("compares constant-time", () => {
    expect(safeEqual("tok123", "tok123")).toBe(true);
    expect(safeEqual("tok123", "tok124")).toBe(false);
    expect(safeEqual("ab", "abc")).toBe(false);
  });
});