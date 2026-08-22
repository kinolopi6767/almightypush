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

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      image,
      data: { url, deliveryId, panelOrigin, buttons },
      actions: buttons.map((b, i) => ({ action: String(i), title: b.label })),
      // Display-level collapse: same topic (else same campaign) replaces an
      // existing still-visible notification instead of stacking.
      tag: topic ?? (campaignId != null ? `c-${campaignId}` : undefined),
      requireInteraction,
      badge: icon,
    }),
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
  try {
    const base = new URL(data.panelOrigin).origin;
    const beaconUrl = new URL(`api/v1/click/${data.deliveryId}?close=1`, base).toString();
    event.waitUntil(fetch(beaconUrl, { method: "GET", keepalive: true }).catch(() => undefined));
  } catch {
    void 0;
  }
});
