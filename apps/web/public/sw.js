/* PushPanel service worker — hosted by the panel, registered by the SDK.
 * Shows notifications from the push payload and reports clicks through the
 * click beacon before opening the target URL.
 *
 * NOTE: register the `push` listener synchronously at the top level (done)
 * so the browser can wake the worker and trust it to show a notification. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PushPanel" };
  }
  // Payload hardening: the panel signs pushes, but a hostile/legacy sender or
  // corrupted body must never crash the handler (a thrown push handler makes
  // the browser display a generic "site updated in background" notification).
  const title = typeof data.title === "string" && data.title ? data.title : "PushPanel";
  const body = typeof data.body === "string" ? data.body : "";
  const icon = typeof data.icon === "string" && data.icon ? data.icon : undefined;
  const image = typeof data.image === "string" && data.image ? data.image : undefined;
  const url = typeof data.url === "string" && data.url ? data.url : "/";
  const deliveryId = Number.isInteger(data.deliveryId) ? data.deliveryId : null;
  const campaignId = Number.isInteger(data.campaignId) ? data.campaignId : null;
  const topic = typeof data.topic === "string" && data.topic ? String(data.topic).slice(0, 64) : null;
  const requireInteraction = data.requireInteraction === true;
  const buttons = Array.isArray(data.buttons)
    ? data.buttons
        .filter((b) => b && typeof b.label === "string" && typeof b.url === "string")
        .slice(0, 2)
        .map((b) => ({ label: b.label, url: b.url }))
    : [];
  const panelOrigin = typeof data.panelOrigin === "string" && data.panelOrigin ? data.panelOrigin : null;

  const options = {
    body,
    icon,
    image,
    data: { url, deliveryId, panelOrigin, buttons, issuedAt: typeof data.issuedAt === "number" ? data.issuedAt : null },
    actions: buttons.map((b, i) => ({ action: String(i), title: b.label })),
    // Display-level collapse: same topic (else same campaign) replaces an
    // existing still-visible notification instead of stacking.
    tag: topic ?? (campaignId != null ? `c-${campaignId}` : undefined),
    requireInteraction,
    badge: icon,
  };

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch(() =>
        // A malformed icon/image URL must not consume the push silently —
        // retry with a bare notification so the user still sees it.
        self.registration.showNotification(title, { body, tag: options.tag, data: options.data }),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { url = "/", deliveryId = null, panelOrigin = null, buttons = [] } = notification.data || {};
  notification.close();

  let actionUrl = url;
  let buttonIndex = "";
  if (event.action) {
    const button = buttons[Number(event.action)] || null;
    if (button && typeof button.url === "string" && button.url) {
      actionUrl = button.url;
      buttonIndex = event.action;
    }
  }

  const fire = (btn = "") => {
    if (!deliveryId) return;
    try {
      const query = btn ? `?btn=${encodeURIComponent(btn.slice(0, 8))}` : "";
      // The beacon must hit the PANEL, not the site origin — the click route
      // does not exist on customer sites. Without panelOrigin there is no
      // correct target, so skip rather than 404 against the customer's site.
      if (!panelOrigin) return;
      const base = new URL(panelOrigin).origin;
      const beaconUrl = new URL(`api/v1/click/${deliveryId}${query}`, base).toString();
      event.waitUntil(fetch(beaconUrl, { method: "GET", keepalive: true }).catch(() => undefined));
    } catch {
      // malformed panelOrigin — never break the click flow
    }
  };

  // Click attribution: only count genuine activations of THIS notification
  // (button presses or notification clicks), which is always the case here.
  fire(buttonIndex);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab WITHOUT navigating it away from what the user
      // was doing — hijacking a checkout page to a promo article is hostile.
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(actionUrl).catch(() => undefined);
    }),
  );
});

// Track dismissals for engagement analytics (best-effort; not all browsers).
self.addEventListener("notificationclose", (event) => {
  const data = event.notification?.data || {};
  if (!data.deliveryId || !data.panelOrigin) return;
  // Tag-collapse replacement fires notificationclose for the OLD notification
  // the instant the new one displays — that's not a user dismissal. Ignore
  // closes within a few seconds of issue. Legacy payloads without issuedAt
  // keep current behavior.
  if (typeof data.issuedAt === "number" && Date.now() - data.issuedAt < 5_000) return;
  try {
    const base = new URL(data.panelOrigin).origin;
    const beaconUrl = new URL(`api/v1/click/${data.deliveryId}?close=1`, base).toString();
    event.waitUntil(fetch(beaconUrl, { method: "GET", keepalive: true }).catch(() => undefined));
  } catch {
    void 0;
  }
});

/* ── Subscription reconciliation ────────────────────────────────────────────
 * Push services rotate endpoints; browsers may drop registrations. The SDK
 * stores {domainId, publicKey, baseUrl} in IndexedDB (shared origin storage
 * readable from the SW — localStorage is NOT). On pushsubscriptionchange we
 * re-subscribe with the stored VAPID key and migrate the server row in place.
 * Chromium/Safari fire this event unreliably, so the page also syncs on load;
 * this handler covers the background cases. */

const IDB_NAME = "pushpanel";
const IDB_STORE = "config";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

function base64UrlToBytes(s) {
  const padding = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const cfg = await idbGet("subscription");
      if (!cfg || !cfg.domainId || !cfg.publicKey || !cfg.baseUrl) return;
      let newSub;
      try {
        newSub =
          event.newSubscription ??
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(cfg.publicKey),
          }));
      } catch {
        // Permission revoked or storage gone — nothing to migrate.
        return;
      }
      const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : undefined;
      try {
        await fetch(`${String(cfg.baseUrl).replace(/\/+$/, "")}/api/v1/resubscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            domainId: cfg.domainId,
            oldEndpoint,
            subscription: { endpoint: newSub.endpoint, keys: newSub.toJSON().keys },
          }),
        });
      } catch {
        // Offline — the page-load sync will reconcile on next visit.
      }
    })(),
  );
});
