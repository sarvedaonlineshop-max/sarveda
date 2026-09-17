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

const firebaseConfig = readConfigFromUrl();
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    // Notification payloads are shown by FCM automatically — only paint data-only pushes.
    if (payload.notification?.title) return;

    const title = payload.data?.title || "Sarveda Admin";
    const body = payload.data?.body || "";
    const link =
      payload.fcmOptions?.link ||
      payload.data?.link ||
      payload.data?.click_action ||
      "/admin";

    return self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { link, ...(payload.data || {}) },
      tag: payload.data?.chatId || payload.data?.orderId || "sarveda-admin",
      renotify: true
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw =
    (event.notification &&
      event.notification.data &&
      event.notification.data.link) ||
    "/admin";
  let url = raw;
  try {
    url = new URL(raw, self.location.origin).href;
  } catch {
    url = self.location.origin + "/admin";
  }

  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });
      for (const client of all) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      await clients.openWindow(url);
    })()
  );
});
