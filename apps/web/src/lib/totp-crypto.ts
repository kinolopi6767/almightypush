import { createCipher } from "@pushpanel/core";

/**
 * TOTP secrets are encrypted at rest with APP_ENC_KEY like every other
 * credential. Values written before this hardening were plaintext — decrypt
 * falls back to the raw value so existing enrollments keep working until the
 * user re-enrolls.
 */
export function encryptTotpSecret(secret: string): string {
  return createCipher(process.env.APP_ENC_KEY).encrypt(secret);
}

export function decryptTotpSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  try {
    return createCipher(process.env.APP_ENC_KEY).decrypt(stored);
  } catch {
    // Legacy plaintext secret (pre-hardening) — verify against it as-is.
    return stored;
  }
}
