"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging
} from "firebase/messaging";

import { getApiBase } from "@/lib/api";

export type FcmWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

const DISMISS_KEY = "sarveda-admin-push-dismissed-v1";
const LAST_TOKEN_KEY = "sarveda-admin-fcm-token";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let foregroundBound = false;

function envFallbackConfig(): FcmWebConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "";
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "";
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim() || "";
  const authDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ||
    (projectId ? `${projectId}.firebaseapp.com` : "");
  if (!apiKey || !projectId || !messagingSenderId || !appId || !vapidKey) {
    return null;
  }
  return { apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey };
}

export async function fetchFcmWebConfig(): Promise<FcmWebConfig | null> {
  const fromEnv = envFallbackConfig();
  try {
    const res = await fetch(`${getApiBase()}/api/auth/fcm-web-config`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (res.status === 404) {
      // Old API build without this route — fall back to public Vercel env if set.
      return fromEnv;
    }
    if (!res.ok) return fromEnv;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { configured?: boolean; config?: FcmWebConfig };
    };
    if (json.data?.configured && json.data.config?.vapidKey) {
      return json.data.config;
    }
  } catch {
    /* fall through */
  }
  return fromEnv;
}

function ensureApp(config: FcmWebConfig): FirebaseApp {
  if (app) return app;
  app =
    getApps()[0] ??
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId
    });
  return app;
}

async function ensureMessaging(config: FcmWebConfig): Promise<Messaging | null> {
  if (!(await isSupported())) return null;
  ensureApp(config);
  if (!messaging) messaging = getMessaging(app!);
  return messaging;
}

async function registerMessagingWorker(
  config: FcmWebConfig
): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    v: "2"
  });
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${params.toString()}`,
    { scope: "/firebase-cloud-messaging-push-scope" }
  );
  await navigator.serviceWorker.ready;
  return registration;
}

async function saveTokenToServer(token: string): Promise<boolean> {
  const res = await fetch(`${getApiBase()}/api/auth/fcm-token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token })
  });
  if (!res.ok) return false;
  try {
    window.localStorage.setItem(LAST_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  return true;
}

export function isPushDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPushPrompt(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPushDismiss(): void {
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* ignore */
  }
}

export type EnablePushResult =
  | { ok: true; token: string }
  | { ok: false; reason: "unsupported" | "not_configured" | "denied" | "error"; message?: string };

/**
 * Request permission (if needed), obtain FCM token, save to backend.
 */
export async function enableAdminPush(): Promise<EnablePushResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!(await isSupported())) {
    return { ok: false, reason: "unsupported" };
  }

  const config = await fetchFcmWebConfig();
  if (!config) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Push is not configured on the server yet."
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    const msg = await ensureMessaging(config);
    if (!msg) return { ok: false, reason: "unsupported" };

    const registration = await registerMessagingWorker(config);
    const token = await getToken(msg, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration ?? undefined
    });
    if (!token) {
      return { ok: false, reason: "error", message: "No FCM token returned." };
    }
    const saved = await saveTokenToServer(token);
    if (!saved) {
      return { ok: false, reason: "error", message: "Could not save push token." };
    }

    // Foreground messages while admin tab is open
    if (!foregroundBound) {
      foregroundBound = true;
      onMessage(msg, (payload) => {
        const title =
          payload.notification?.title || payload.data?.title || "Sarveda Admin";
        const body = payload.notification?.body || payload.data?.body || "";
        if (Notification.permission === "granted" && body) {
          const link =
            payload.fcmOptions?.link ||
            payload.data?.link ||
            (payload.data?.chatId
              ? `/admin/chats/${payload.data.chatId}`
              : payload.data?.orderId
                ? `/admin/orders/${payload.data.orderId}`
                : "/admin");
          const n = new Notification(title, {
            body,
            icon: "/icons/icon-192.png",
            tag: payload.data?.chatId || payload.data?.orderId || "sarveda-admin"
          });
          n.onclick = () => {
            window.focus();
            window.location.href = link;
            n.close();
          };
        }
      });
    }

    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err)
    };
  }
}

/** Quiet refresh when permission already granted (e.g. after login). */
export async function refreshAdminPushIfGranted(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const result = await enableAdminPush();
  return result.ok;
}
