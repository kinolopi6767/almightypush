import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto.js";

/**
 * TOTP (RFC 6238) for two-factor auth — HMAC-SHA1, 30s period, 6 digits,
 * ±1 step drift window. Implemented on node:crypto so no external deps.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[=\s]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Current TOTP code for a base32 secret (time override useful for tests). */
export function totpCode(secretB32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretB32), counter);
}

/** RFC 6238 verification with a ±WINDOW step drift allowance. */
export function verifyTotp(secretB32: string, code: string, atMs: number = Date.now()): boolean {
  if (!code || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (let i = -WINDOW; i <= WINDOW; i++) {
    if (safeEqual(hotp(base32Decode(secretB32), counter + i), code)) return true;
  }
  return false;
}

/** Fresh random TOTP secret (base32, 160 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** otpauth:// provisioning URI for authenticator apps. */
export function totpUri(secretB32: string, account: string, issuer = "PushPanel"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&period=${STEP_SECONDS}&digits=${DIGITS}`;
}