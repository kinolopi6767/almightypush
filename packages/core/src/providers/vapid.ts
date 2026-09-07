import webpush from "web-push";
import type { PushMessage, PushProvider, PushSubscriptionPayload, SendOptions, SendResult } from "./index";

interface WebPushError extends Error {
  statusCode?: number;
  headers?: Record<string, string>;
}

/** Parse a Retry-After value (delay-seconds or HTTP-date) into ms, clamped. */
export function parseRetryAfterMs(value: string | undefined, nowMs = Date.now()): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const trimmed = value.trim().slice(0, 200);
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, 15 * 60_000);
  }
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) {
    return Math.min(Math.max(at - nowMs, 0), 15 * 60_000);
  }
  return undefined;
}

/**
 * Push services reject payloads over ~4096 bytes (413/400). A 500-char
 * message + long URLs + 3 buttons + tracking ids can exceed that — and
 * without a cap EVERY delivery of the campaign would fail-fast on 400.
 * Shrink gracefully: body first, then title; URLs/buttons are never cut
 * (a truncated URL is worse than a truncated sentence).
 */
export const MAX_PUSH_PAYLOAD_BYTES = 4096;

export function fitPushPayload(message: PushMessage, budget: number = MAX_PUSH_PAYLOAD_BYTES): PushMessage {
  const size = (m: PushMessage) => Buffer.byteLength(JSON.stringify(m), "utf8");
  if (size(message) <= budget) return message;
  // Surrogate-safe truncation: slice by code points so emoji are never split.
  const cut = (s: string | undefined, maxChars: number): string | undefined => {
    if (!s) return s;
    const chars = Array.from(s);
    if (chars.length <= maxChars) return s;
    // maxChars<=0 → empty string (never "…" alone): fixed overhead alone may
    // exceed the budget, and the result must be allowed to shrink to empty
    // so the tiered degradation below can still fit.
    if (maxChars <= 0) return "";
    return `${chars.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
  };
  // Binary-search the body length: multibyte chars make byte math nonlinear.
  let body = message.body;
  if (body) {
    let lo = 0;
    let hi = body.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (size({ ...message, body: cut(body, mid) }) <= budget) lo = mid;
      else hi = mid - 1;
    }
    body = cut(body, lo);
  }
  const shrunk: PushMessage = { ...message, body };
  if (size(shrunk) <= budget) return shrunk;
  // Still over (giant URLs/buttons): degrade gracefully instead of failing
  // 100% of deliveries — drop image, then buttons, then title, then body.
  const noImage: PushMessage = { ...shrunk, image: undefined };
  if (size(noImage) <= budget) return noImage;
  const noButtons: PushMessage = { ...noImage, buttons: undefined };
  if (size(noButtons) <= budget) return noButtons;
  // Still over: trim the title as a last resort.
  const title = message.title;
  let lo = 0;
  let hi = title.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (size({ ...shrunk, title: cut(title, mid) ?? title }) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return { ...shrunk, title: cut(title, lo) ?? title };
}

/**
 * Validate a push message before send: scheme allowlist + length clamps.
 * A `javascript:` URL in payload → SW clients.openWindow(url) = XSS/open-redirect.
 */
export function validatePushMessage(message: PushMessage): void {
  if (!message || typeof message.title !== "string" || message.title.trim().length === 0) {
    throw new Error("Push title is required");
  }
  if (message.title.length > 200) throw new Error("Push title too long");
  if (message.body && message.body.length > 1000) throw new Error("Push body too long");
  const httpOnly = (u: string | undefined, label: string) => {
    if (!u) return;
    if (u.length > 2000) throw new Error(`${label} too long`);
    if (!/^https?:\/\//i.test(u)) throw new Error(`${label} must be an http(s) URL`);
  };
  httpOnly(message.url, "Push URL");
  httpOnly(message.icon, "Push icon");
  httpOnly(message.image, "Push image");
  if (message.buttons) {
    if (message.buttons.length > 3) throw new Error("Too many buttons");
    for (const b of message.buttons) {
      if (!b.label || b.label.length > 50) throw new Error("Invalid button label");
      httpOnly(b.url, "Button URL");
    }
  }
}

export function clampSendTtl(ttl: number | undefined): number {
  if (ttl === undefined) return 86_400;
  if (!Number.isFinite(ttl)) return 86_400;
  return Math.min(Math.max(Math.floor(ttl), 0), 2_419_200);
}

/**
 * VAPID provider backed by the `web-push` lib (ES256 JWS + RFC 8291 ECE).
 * VAPID details are passed per-send, never set globally — one panel process
 * serves many domains with distinct keypairs.
 */
export class VapidPushProvider implements PushProvider {
  async send(
    subscription: PushSubscriptionPayload,
    message: PushMessage,
    options: SendOptions,
  ): Promise<SendResult> {
    // Fail-closed input validation (runtime callers may be plain JS).
    try {
      validatePushMessage(message);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid push message" };
    }
    if (!subscription?.endpoint || typeof subscription.endpoint !== "string") {
      return { ok: false, error: "Invalid subscription endpoint" };
    }
    // Production endpoints are https: (http allowed only for loopback dev).
    try {
      const u = new URL(subscription.endpoint);
      const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
      if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) {
        return { ok: false, error: "Subscription endpoint must be https:" };
      }
    } catch {
      return { ok: false, error: "Invalid subscription endpoint" };
    }
    const ttl = clampSendTtl(options.ttl);
    const topic = typeof options.topic === "string" ? options.topic.slice(0, 64) : options.topic;
    const payload = JSON.stringify(fitPushPayload(message));
    const vapidDetails = {
      subject: options.vapid.subject,
      publicKey: options.vapid.publicKey,
      privateKey: options.vapid.privateKey,
    };
    try {
      const res = await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        payload,
        {
          vapidDetails,
          TTL: ttl,
          urgency: options.urgency ?? "normal",
          topic,
          // Hard cap per request — without it one black-holed push endpoint
          // holds a pool slot indefinitely (Node https has no default timeout),
          // which can stretch a send cycle past the stale-claim window.
          timeout: 30_000,
        },
      );
      return { ok: true, statusCode: res.statusCode };
    } catch (error) {
      const err = error as WebPushError;
      const retryAfterMs =
        err.statusCode === 429 ? parseRetryAfterMs(err.headers?.["retry-after"]) : undefined;
      // Sanitize: web-push errors may contain endpoint/JWT internals — log
      // only the status class, never the raw message with PII.
      const safe = typeof err.statusCode === "number" ? `Push failed with status ${err.statusCode}` : "Push failed";
      return { ok: false, statusCode: err.statusCode, error: safe, retryAfterMs };
    }
  }
}
