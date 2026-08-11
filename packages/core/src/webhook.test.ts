import { describe, expect, it } from "vitest";
import { newWebhookSecret, signWebhook, verifyWebhook } from "./webhook";

describe("webhook signing", () => {
  const secret = newWebhookSecret();

  it("verifies a valid signature", () => {
    const body = JSON.stringify({ published: true });
    expect(verifyWebhook(secret, body, `sha256=${signWebhook(secret, body)}`)).toBe(true);
  });

  it("rejects a wrong secret or tampered body", () => {
    const body = JSON.stringify({ published: true });
    const sig = signWebhook(secret, body);
    expect(verifyWebhook("another-secret", body, `sha256=${sig}`)).toBe(false);
    expect(verifyWebhook(secret, JSON.stringify({ published: false }), `sha256=${sig}`)).toBe(false);
    expect(verifyWebhook(secret, body, "sha256=deadbeef")).toBe(false);
    expect(verifyWebhook(secret, body, null)).toBe(false);
    expect(verifyWebhook(secret, body, "md5=deadbeef")).toBe(false);
  });

  it("binds the timestamp into the signed payload (replay guard)", () => {
    const body = JSON.stringify({ published: true });
    const signedAt = 1_700_000_000_000;
    // valid only for the exact timestamp it was signed with
    expect(verifyWebhook(secret, body, `sha256=${signWebhook(secret, body, signedAt)}`, signedAt)).toBe(true);
    // a freshly forged timestamp header does not validate the old signature
    expect(verifyWebhook(secret, body, `sha256=${signWebhook(secret, body, signedAt)}`, signedAt + 60_000)).toBe(false);
  });

  it("generates distinct secrets", () => {
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
  });
});