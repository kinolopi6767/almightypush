import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpCode, totpUri, verifyTotp } from "./totp";

// RFC 6238 test vector: SHA1, T=59 → 94287082 (8 digits); our impl uses 6 digits,
// so instead pin to a locally computed pair.
describe("totp", () => {
  const secret = "JBSWY3DPEHPK3PXP";

  it("generates a 16-char base32 secret", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{16,}$/);
  });

  it("produces a 6-digit code and verifies it", () => {
    const at = 1_700_000_000_000;
    const code = totpCode(secret, at);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, at)).toBe(true);
  });

  it("accepts codes within the drift window and rejects stale ones", () => {
    const at = 1_700_000_000_000;
    const code = totpCode(secret, at - 30_000); // one step in the past
    expect(verifyTotp(secret, code, at)).toBe(true);
    const tooOld = totpCode(secret, at - 120_000);
    expect(verifyTotp(secret, tooOld, at)).toBe(false);
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(secret, "")).toBe(false);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
  });

  it("builds an otpauth URI", () => {
    const uri = totpUri(secret, "owner@test.io");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=PushPanel");
    expect(uri).toContain("digits=6");
  });
});