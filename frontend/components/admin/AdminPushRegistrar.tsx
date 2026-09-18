"use client";

import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  clearPushDismiss,
  dismissPushPrompt,
  enableAdminPush,
  hasWebPushRegisteredLocally,
  isPushDismissed,
  refreshAdminPushIfGranted,
  type EnablePushProgress
} from "@/lib/admin-fcm";

const STEP_LABEL: Record<EnablePushProgress, string> = {
  config: "Loading push settings…",
  permission: "Waiting for Allow at the top of the screen…",
  service_worker: "Setting up notification worker…",
  token: "Connecting to Firebase…",
  save: "Saving on server…"
};

/**
 * Registers browser/PWA FCM for logged-in admins (order + chat alerts).
 * Flutter Task Manager is not used for these alerts.
 */
export function AdminPushRegistrar() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<EnablePushProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneHint, setDoneHint] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Deep-link when a push is tapped while Admin is already open (desktop + mobile PWA).
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "SARVEDA_ADMIN_PUSH_NAV" || !data.url) return;
      try {
        const next = new URL(data.url, window.location.origin);
        if (next.origin !== window.location.origin) return;
        if (`${next.pathname}${next.search}${next.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
          return;
        }
        window.location.assign(next.href);
      } catch {
        /* ignore bad urls */
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;

      if (Notification.permission === "granted") {
        setBlocked(false);
        const ok = await refreshAdminPushIfGranted();
        if (cancelled) return;
        if (ok) {
          setShowPrompt(false);
          return;
        }
        // Permission granted but token not saved — force the enable card again.
        clearPushDismiss();
        setShowPrompt(true);
        return;
      }

      if (Notification.permission === "denied") {
        if (cancelled) return;
        setBlocked(true);
        // Don't nag forever after "Not now" / dismiss while blocked.
        if (isPushDismissed()) {
          setShowPrompt(false);
          return;
        }
        setShowPrompt(true);
        setError(
          "Notifications are blocked for sarveda.com. Chrome → Site settings → Notifications → Allow, then tap Enable again."
        );
        return;
      }

      if (isPushDismissed() && hasWebPushRegisteredLocally()) return;
      if (isPushDismissed()) return;
      if (!cancelled) setShowPrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onEnable = useCallback(async () => {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      setBlocked(true);
      setError(
        "Chrome is still blocking notifications. Open the lock icon in the address bar → Site settings → Notifications → Allow, refresh this page, then tap Enable again."
      );
      return;
    }

    setBusy(true);
    setError(null);
    setStep("config");
    const result = await enableAdminPush((next) => setStep(next));
    setBusy(false);
    setStep(null);
    if (result.ok) {
      setBlocked(false);
      setShowPrompt(false);
      setDoneHint(true);
      window.setTimeout(() => setDoneHint(false), 4000);
      return;
    }
    if (result.reason === "denied") {
      setBlocked(true);
      setError(
        "Notifications blocked. Address-bar lock icon → Site settings → Notifications → Allow, then refresh."
      );
      return;
    }
    if (result.reason === "not_configured") {
      setError(result.message || "Push is not configured on the server yet.");
      return;
    }
    if (result.reason === "unsupported") {
      setError("This browser cannot receive web push. Use Chrome (desktop or Android).");
      return;
    }
    setError(result.message || "Could not enable notifications.");
  }, []);

  const onDismiss = useCallback(() => {
    dismissPushPrompt();
    setShowPrompt(false);
  }, []);

  if (doneHint) {
    return (
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-[80] w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl bg-[#1c352a] px-4 py-3 text-center text-sm text-white shadow-lg md:bottom-6"
        role="status"
      >
        Web alerts on — taps open the order or chat in Admin
      </div>
    );
  }

  if (!showPrompt) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2 rounded-2xl border border-[#d9d1c4] bg-[#faf6ee] p-3 shadow-[0_8px_28px_rgba(28,53,42,0.18)] md:bottom-6"
      role="dialog"
      aria-label="Enable web push notifications"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1c352a] text-white">
          <Bell size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1c352a]">Enable web order &amp; chat alerts</p>
          <p className="mt-0.5 text-[12px] leading-snug text-stone-600">
            Chrome / installed site only. Tap opens the exact order or chat.
          </p>
          {busy && step ? (
            <p className="mt-1.5 text-[11px] font-medium text-[#1c352a]">{STEP_LABEL[step]}</p>
          ) : null}
          {error ? <p className="mt-1.5 text-[11px] text-red-600">{error}</p> : null}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnable()}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#3d8b4f] px-3.5 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Enabling…" : blocked ? "I allowed — enable" : "Allow notifications"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="inline-flex h-9 items-center justify-center rounded-full px-2.5 text-[12px] font-medium text-stone-500 hover:bg-black/5"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-black/5 hover:text-stone-700"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
