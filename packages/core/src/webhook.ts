import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 signing for the public automation webhook.
 * Signature format: `sha256=<hex>` in the X-PushPanel-Signature header.
 *
 * Replay protection: the signed payload is `<timestamp>.<raw body>` — the
 * X-PushPanel-Timestamp header is covered by the HMAC, so a captured request
 * cannot be replayed with a fresh header.
 */
export function signWebhook(secret: string, body: string | Buffer, timestamp?: number): string {
  const data = timestamp === undefined ? body : `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyWebhook(secret: string, body: string | Buffer, signature: string | null | undefined, timestamp?: number): boolean {
  if (!signature) return false;
  const [scheme, hex] = signature.split("=", 2);
  if (scheme !== "sha256" || !hex) return false;
  const expected = signWebhook(secret, body, timestamp);
  if (expected.length !== hex.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(hex, "utf8"));
}

/** Fresh random secret for per-automation webhook auth. */
export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}