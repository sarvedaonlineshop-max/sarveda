/* Sarveda admin — FCM background worker (separate from next-pwa sw.js).
 * Config is passed as query params when the page registers this worker.
 */
/* eslint-disable no-undef */
importScripts(
  "https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js"
);

function readConfigFromUrl() {
  try {
    const params = new URL(self.location.href).searchParams;
    const apiKey = params.get("apiKey") || "";
    const projectId = params.get("projectId") || "";
    const messagingSenderId = params.get("messagingSenderId") || "";
    const appId = params.get("appId") || "";
    const authDomain =
      params.get("authDomain") ||
      (projectId ? `${projectId}.firebaseapp.com` : "");
    if (!apiKey || !projectId || !messagingSenderId || !appId) return null;
    return { apiKey, authDomain, projectId, messagingSenderId, appId };
  } catch {
    return null;
  }
}

function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}

/** Build absolute admin URL from FCM notification data (several shapes). */
function resolveAdminUrl(rawData) {
  const origin = self.location.origin;
  const data = asRecord(rawData) || {};
  const nested =
    asRecord(data.FCM_MSG) ||
    asRecord(data.fcmMessage) ||
    asRecord(data.data) ||
    {};
  const merged = { ...nested, ...data };

  const candidates = [
    merged.link,
    merged.click_action,
    merged.chatId ? `/admin/chats/${merged.chatId}` : "",
    merged.orderId ? `/admin/orders/${merged.orderId}` : ""
  ].filter((v) => typeof v === "string" && v.trim());

  const raw = candidates[0] || "/admin";
  try {
    return new URL(raw, origin).href;
  } catch {
    return `${origin}/admin`;
  }
}

const firebaseConfig = readConfigFromUrl();
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    // When FCM includes a notification payload, the browser already displays it.
    // Still attach nothing here — notificationclick below reconstructs the deep link.
    if (payload.notification?.title) return;

    const title = payload.data?.title || "Sarveda Admin";
    const body = payload.data?.body || "";
    const link = resolveAdminUrl(payload.data || {});

    return self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png?v=sarveda-app-icon-3",
      badge: "/icons/icon-192.png?v=sarveda-app-icon-3",
      data: { link, ...(payload.data || {}) },
      tag: payload.data?.chatId || payload.data?.orderId || "sarveda-admin",
      renotify: true
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = resolveAdminUrl(event.notification && event.notification.data);

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of all) {
        if (!client.url.startsWith(self.location.origin)) continue;
        if (!("focus" in client)) continue;

        await client.focus();
        // Next.js App Router often ignores WindowClient.navigate() when already open.
        // postMessage → page does location.assign so order/chat deep links always apply.
        try {
          client.postMessage({ type: "SARVEDA_ADMIN_PUSH_NAV", url });
        } catch {
          /* ignore */
        }
        return;
      }

      await clients.openWindow(url);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
