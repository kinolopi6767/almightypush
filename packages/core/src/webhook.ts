import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 signing for the public automation webhook.
 * Signature format: `sha256=<hex>` in the X-PushPanel-Signature header,
 * computed over the raw request body. Timestamp header guards against replay.
 */
export function signWebhook(secret: string, body: string | Buffer): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhook(secret: string, body: string | Buffer, signature: string | null | undefined): boolean {
  if (!signature) return false;
  const [scheme, hex] = signature.split("=", 2);
  if (scheme !== "sha256" || !hex) return false;
  const expected = signWebhook(secret, body);
  if (expected.length !== hex.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(hex, "utf8"));
}

/** Fresh random secret for per-automation webhook auth. */
export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}
