/**
 * Push provider abstraction. Delivery backends implement `PushProvider`:
 * - VAPID (default, web-push lib)
 * - FCM (M6+ compatibility, firebase-admin)
 */
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushButton {
  label: string;
  icon?: string;
  url: string;
}

export interface PushMessage {
  title: string;
  body?: string;
  icon?: string;
  image?: string;
  /** URL the notification opens on click */
  url?: string;
  buttons?: PushButton[];
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface SendOptions {
  vapid: VapidDetails;
  /** seconds the push service keeps the message if the device is offline */
  ttl?: number;
  urgency?: "low" | "normal" | "high";
  topic?: string;
}

export type SendResult = { ok: true; statusCode: number } | { ok: false; statusCode?: number; error: string };

export interface PushProvider {
  send(subscription: PushSubscriptionPayload, message: PushMessage, options: SendOptions): Promise<SendResult>;
}

export { VapidPushProvider } from "./vapid";
