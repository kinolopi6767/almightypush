import webpush from "web-push";
import type { PushMessage, PushProvider, PushSubscriptionPayload, SendOptions, SendResult } from "./index";

interface WebPushError extends Error {
  statusCode?: number;
  headers?: Record<string, string>;
}

/** Parse a Retry-After value (delay-seconds or HTTP-date) into ms, clamped. */
export function parseRetryAfterMs(value: string | undefined, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
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
  const cut = (s: string | undefined, maxChars: number): string | undefined => {
    if (!s) return s;
    if (s.length <= maxChars) return s;
    return `${s.slice(0, Math.max(0, maxChars - 1))}…`;
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
  // Still over (giant URLs/buttons): trim the title as a last resort.
  let title = message.title;
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
          TTL: options.ttl ?? 86_400,
          urgency: options.urgency ?? "normal",
          topic: options.topic,
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
      return { ok: false, statusCode: err.statusCode, error: err.message ?? String(error), retryAfterMs };
    }
  }
}
