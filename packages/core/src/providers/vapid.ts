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
        },
      );
      return { ok: true, statusCode: res.statusCode };
    } catch (error) {
      const err = error as WebPushError;
      return { ok: false, statusCode: err.statusCode, error: err.message ?? String(error) };
    }
  }
}
