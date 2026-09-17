"use client";

import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  dismissPushPrompt,
  enableAdminPush,
  isPushDismissed,
  refreshAdminPushIfGranted
} from "@/lib/admin-fcm";

/**
 * Registers FCM for logged-in admins and prompts once to enable order/chat push.
 */
export function AdminPushRegistrar() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneHint, setDoneHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof window === "undefined" || !("Notification" in window)) return;

      if (Notification.permission === "granted") {
        await refreshAdminPushIfGranted();
        return;
      }

      if (Notification.permission === "denied") return;
      if (isPushDismissed()) return;
      if (!cancelled) setShowPrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await enableAdminPush();
    setBusy(false);
    if (result.ok) {
      setShowPrompt(false);
      setDoneHint(true);
      window.setTimeout(() => setDoneHint(false), 3500);
      return;
    }
    if (result.reason === "denied") {
      setError("Notifications blocked. Enable them in the browser site settings, then try again.");
      return;
    }
    if (result.reason === "not_configured") {
      setError(
        result.message ||
          "Push keys missing on server. Deploy latest API (git pull + build) and set FIREBASE_WEB_* in backend/.env."
      );
      return;
    }
    if (result.reason === "unsupported") {
      setShowPrompt(false);
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
        Order &amp; chat alerts enabled
      </div>
    );
  }

  if (!showPrompt) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2 rounded-2xl border border-[#d9d1c4] bg-[#faf6ee] p-3 shadow-[0_8px_28px_rgba(28,53,42,0.18)] md:bottom-6"
      role="dialog"
      aria-label="Enable push notifications"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1c352a] text-white">
          <Bell size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1c352a]">Enable order &amp; chat alerts</p>
          <p className="mt-0.5 text-[12px] leading-snug text-stone-600">
            Get a phone notification when a new order is paid or a customer chats — even if admin is closed.
          </p>
          {error ? <p className="mt-1.5 text-[11px] text-red-600">{error}</p> : null}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onEnable()}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#3d8b4f] px-3.5 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Enabling…" : "Allow notifications"}
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
