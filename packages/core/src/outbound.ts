import { signWebhook } from "./webhook.js";
import { ssrfFetch } from "./net.js";

export interface OutboundWebhookConfig {
  url: string;
  /** Optional HMAC secret — when set, requests carry X-PushPanel-Signature. */
  secret: string | null;
}

/**
 * Outbound event webhook: POST an HMAC-signed JSON payload to a configured
 * endpoint. Fire-and-forget by design — a slow or dead endpoint must NEVER
 * delay or break the user-facing path (subscribe / click / send). Errors are
 * swallowed; delivery is at-most-once.
 */
export function emitWebhookEvent(
  config: OutboundWebhookConfig,
  event: string,
  data: Record<string, unknown>,
  opts: { onError?: (err: Error) => void } = {},
): void {
  try {
    // Validate the URL cheaply before any async work; never emit to a
    // malformed destination.
    const target = new URL(config.url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      opts.onError?.(new Error(`webhook rejected: non-http(s) scheme for event ${event}`));
      return;
    }
    if (target.username || target.password) {
      opts.onError?.(new Error(`webhook rejected: credentials in URL for event ${event}`));
      return;
    }
    if (!config.secret) {
      // Unsigned webhooks are a misconfiguration, not a silent default —
      // surface once via the hook so operators notice.
      opts.onError?.(new Error(`webhook ${event}: no secret configured, sending unsigned`));
    }
    let body: string;
    try {
      const safe = JSON.stringify({ event, created_at: new Date().toISOString(), data });
      if (safe.length > 100_000) {
        opts.onError?.(new Error(`webhook ${event}: payload too large, dropped`));
        return;
      }
      body = safe;
    } catch {
      opts.onError?.(new Error(`webhook ${event}: unserializable payload, dropped`));
      return;
    }
    const timestamp = Date.now();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-pushpanel-event": event.replace(/[\r\n]/g, "").slice(0, 64),
      "x-pushpanel-timestamp": String(timestamp),
      "user-agent": "PushPanel-Webhooks/1.0",
    };
    if (config.secret) {
      headers["x-pushpanel-signature"] = `sha256=${signWebhook(config.secret, body, timestamp)}`;
    }
    // ssrfFetch: connect-time IP re-validation + per-hop redirect validation
    // (a configured endpoint must never bounce onto a private address).
    // Drain the body so the undici socket returns to the pool — an unread
    // response body pins the connection until GC.
    void ssrfFetch(target.toString(), {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(3_000),
    })
      .then((res) => {
        if (!res.ok) opts.onError?.(new Error(`webhook ${event} failed: ${res.status}`));
        return res.arrayBuffer().catch(() => undefined);
      })
      .catch((e) => opts.onError?.(e instanceof Error ? e : new Error(String(e))));
  } catch (e) {
    opts.onError?.(e instanceof Error ? e : new Error(String(e)));
  }
}
