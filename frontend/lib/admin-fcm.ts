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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

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
    const res = await withTimeout(
      fetch(`${getApiBase()}/api/auth/fcm-web-config`, {
        credentials: "include",
        headers: { Accept: "application/json" }
      }),
      12000,
      "Loading push config"
    );
    if (res.status === 404) {
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
    v: "3"
  });
  const registration = await withTimeout(
    navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
      scope: "/firebase-cloud-messaging-push-scope"
    }),
    15000,
    "Registering notification service worker"
  );
  // Prefer this worker becoming active rather than waiting on another site SW.
  if (registration.installing) {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const worker = registration.installing;
        if (!worker) {
          resolve();
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "activated") resolve();
          if (worker.state === "redundant") {
            reject(new Error("Notification service worker failed to activate"));
          }
        });
      }),
      15000,
      "Activating notification service worker"
    );
  } else if (registration.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }
  return registration;
}

async function saveTokenToServer(token: string): Promise<boolean> {
  const res = await withTimeout(
    fetch(`${getApiBase()}/api/auth/fcm-token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token, platform: "web" })
    }),
    12000,
    "Saving push token"
  );
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

export type EnablePushProgress =
  | "config"
  | "permission"
  | "service_worker"
  | "token"
  | "save";

/**
 * Request permission (if needed), obtain FCM token, save to backend.
 */
export async function enableAdminPush(
  onProgress?: (step: EnablePushProgress) => void
): Promise<EnablePushResult> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!(await isSupported())) {
    return { ok: false, reason: "unsupported" };
  }

  onProgress?.("config");
  const config = await fetchFcmWebConfig();
  if (!config) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Push is not configured on the server yet."
    };
  }

  onProgress?.("permission");
  let permission = Notification.permission;
  if (permission === "default") {
    // Chrome may show the system Allow/Block sheet at the TOP of the screen.
    permission = await withTimeout(
      Notification.requestPermission(),
      45000,
      "Waiting for notification permission (check the Allow prompt at the top of the screen)"
    );
  }
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    const msg = await ensureMessaging(config);
    if (!msg) return { ok: false, reason: "unsupported" };

    onProgress?.("service_worker");
    const registration = await registerMessagingWorker(config);

    onProgress?.("token");
    const token = await withTimeout(
      getToken(msg, {
        vapidKey: config.vapidKey,
        serviceWorkerRegistration: registration ?? undefined
      }),
      20000,
      "Getting FCM token (check VAPID key / Firebase web config)"
    );
    if (!token) {
      return { ok: false, reason: "error", message: "No FCM token returned." };
    }

    onProgress?.("save");
    const saved = await saveTokenToServer(token);
    if (!saved) {
      return { ok: false, reason: "error", message: "Could not save push token." };
    }

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
