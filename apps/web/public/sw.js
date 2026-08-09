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
      data: { url, deliveryId },
      actions: buttons.map((b) => ({ action: b.label, title: b.label })),
      badge: undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { url = "/", deliveryId = null } = notification.data || {};
  notification.close();

  const beacon = (target) => {
    if (deliveryId) {
      fetch(`api/v1/click/${deliveryId}`, { method: "GET", keepalive: true }).catch(() => undefined);
    }
    clients.openWindow(target).catch(() => undefined);
  };

  const actionUrl = event.action
    ? (notification.actions || []).find((a) => a.action === event.action)?.title || url
    : url;

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
