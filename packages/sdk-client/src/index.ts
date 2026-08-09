/**
 * PushPanel client SDK v0 — subscription-only slice of the M1 VAPID loop.
 * - requests notification permission
 * - registers the panel's service worker
 * - subscribes via PushManager with the domain's VAPID public key
 * - reports the subscription to the panel's /api/v1/subscribe endpoint
 *
 * Built as a UMD bundle (`dist/pushpanel-sdk.js`, global `PushPanel`) so
 * sites can use it with a plain <script> tag.
 */

export interface PushPanelOptions {
  /** Domain id as shown in the panel */
  domain: number;
  /** Domain's VAPID public key (base64url) */
  publicKey: string;
  /** Panel base URL, e.g. https://push.example.com (defaults to current origin) */
  baseUrl?: string;
  /** Service worker path on the site (default /sw.js) */
  serviceWorkerPath?: string;
  /** Sandbox/dev only: replace the push service endpoint (e.g. a local mock). */
  endpointOverride?: string;
}

export type PushPanelState = "unsupported" | "idle" | "denied" | "subscribed" | "error";

export interface PushPanelApi {
  subscribe(): Promise<PushPanelState>;
  state(): PushPanelState;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function guessDevice(): { device: string; browser: string; os: string } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const os = /Windows/i.test(ua)
    ? "windows"
    : /Mac OS X/.test(ua)
      ? "macos"
      : /Android/i.test(ua)
        ? "android"
        : /iPhone|iPad|iPod/i.test(ua)
          ? "ios"
          : /Linux/i.test(ua)
            ? "linux"
            : "unknown";
  const browser = /Edg\//i.test(ua)
    ? "edge"
    : /OPR\//i.test(ua)
      ? "opera"
      : /Firefox\//i.test(ua)
        ? "firefox"
        : /Chrome\//i.test(ua)
          ? "chrome"
          : /Safari\//i.test(ua)
            ? "safari"
            : "unknown";
  return { device: isMobile ? "mobile" : "desktop", browser, os };
}

export function init(options: PushPanelOptions): PushPanelApi {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const swPath = options.serviceWorkerPath ?? "/sw.js";
  let current: PushPanelState = "idle";

  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    current = "unsupported";
  }

  return {
    state: () => current,
    async subscribe() {
      if (current === "unsupported") return "unsupported";
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          current = "denied";
          return current;
        }
        const registration = await navigator.serviceWorker.register(swPath);
        const applicationServerKey = urlBase64ToUint8Array(options.publicKey);
        let subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        if (options.endpointOverride) {
          subscription = { ...subscription, endpoint: options.endpointOverride } as PushSubscription;
        }
        const payload = {
          domainId: options.domain,
          subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys },
          ...guessDevice(),
          subscribeUrl: location.href,
        };
        const res = await fetch(`${baseUrl}/api/v1/subscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`subscribe failed (${res.status})`);
        current = "subscribed";
      } catch (error) {
        current = "error";
        throw error;
      }
      return current;
    },
  };
}
