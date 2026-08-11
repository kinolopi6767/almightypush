import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * At-rest encryption (AES-256-GCM) for secrets: domains.provider_config,
 * api_keys tokens, subscriber push tokens.
 *
 * Key: APP_ENC_KEY (32 bytes hex). Format: `v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>`.
 */

const IV_LEN = 12;

function keyFrom(encKey: string | undefined): Buffer {
  if (!encKey) throw new Error("APP_ENC_KEY is required for at-rest encryption");
  const hex = encKey.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("APP_ENC_KEY must be 32 bytes as 64 hex chars");
  return Buffer.from(hex, "hex");
}

export function createCipher(encKey?: string) {
  const key = keyFrom(encKey);
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
    },
    decrypt(payload: string): string {
      const [version, ivB64, tagB64, ctB64] = payload.split(":");
      if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
        throw new Error("Malformed encrypted payload");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/** sha256 hex of a push token — dedupe/lookup without storing plaintext searchable. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Constant-ish-time comparison for API key / token checks. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ bb[i]!;
  return diff === 0;
}
/** H5: one-time plaintext API key token (`ppk_live_` + 48 hex chars). */
export function generateApiKeyToken(): string {
  return `ppk_live_${randomBytes(24).toString("hex")}`;
}
