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

  const beacon = (target) => {
    if (deliveryId) {
      // Absolute against the SW scope: the beacon must hit the panel, not
      // whatever page the notification was clicked from.
      fetch(new URL(`api/v1/click/${deliveryId}`, self.registration.scope).toString(), { method: "GET", keepalive: true }).catch(() => undefined);
    }
    clients.openWindow(target).catch(() => undefined);
  };

  let actionUrl = url;
  if (event.action) {
    const button = buttons[Number(event.action)] || null;
    if (button && typeof button.url === "string" && button.url) actionUrl = button.url;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.navigate(actionUrl).catch(() => undefined);
          return;
        }
      }
      beacon(actionUrl);
    }),
  );
});
