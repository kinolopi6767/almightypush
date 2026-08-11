/* PushPanel service worker — hosted by the panel, registered by the SDK.
 * Shows notifications from the push payload and reports clicks through the
 * click beacon before opening the target URL. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PushPanel" };
  }
  const {
    title = "PushPanel",
    body = "",
    icon = "",
    image = "",
    url = "/",
    deliveryId = null,
    buttons = [],
  } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || undefined,
      image: image || undefined,
      data: { url, deliveryId, buttons: buttons.map((b) => ({ label: b.label, url: b.url })) },
      actions: buttons.map((b, i) => ({ action: String(i), title: b.label })),
      badge: undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { url = "/", deliveryId = null, buttons = [] } = notification.data || {};
  notification.close();

  const fire = (btn = "") => {
    if (deliveryId) {
      // Absolute against the SW scope: the beacon must hit the panel, not
      // whatever page the notification was clicked from. `btn` lets the
      // panel attribute a click to a specific action button (E4).
      const query = btn ? `?btn=${encodeURIComponent(btn)}` : "";
      fetch(new URL(`api/v1/click/${deliveryId}${query}`, self.registration.scope).toString(), { method: "GET", keepalive: true }).catch(() => undefined);
    }
  };

  let actionUrl = url;
  let buttonIndex = "";
  if (event.action) {
    const button = buttons[Number(event.action)] || null;
    if (button && typeof button.url === "string" && button.url) {
      actionUrl = button.url;
      buttonIndex = event.action;
    }
  }

  // Always fire the beacon (click attribution) before navigating — whether
  // the click lands in an existing window or opens a new one.
  fire(buttonIndex);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.navigate(actionUrl).catch(() => undefined);
          return;
        }
      }
      clients.openWindow(actionUrl).catch(() => undefined);
    }),
  );
});
