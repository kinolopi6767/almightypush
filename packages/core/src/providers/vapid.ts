import webpush from "web-push";
import type { PushMessage, PushProvider, PushSubscriptionPayload, SendOptions, SendResult } from "./index";

interface WebPushError extends Error {
  statusCode?: number;
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
    const payload = JSON.stringify(message);
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
      return { ok: false, statusCode: err.statusCode, error: err.message ?? String(error) };
    }
  }
}
