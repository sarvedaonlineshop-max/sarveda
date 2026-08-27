"use client";

import { useEffect, useState } from "react";

import { logoutSession } from "@/lib/auth-client";

export const LOGOUT_START_EVENT = "sarveda-logout-start";

/**
 * Full-screen "Logging out…" overlay. Mount once near the app root.
 * Trigger via {@link signOutToLogin}.
 */
export function LogoutTransitionOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onStart = () => setVisible(true);
    window.addEventListener(LOGOUT_START_EVENT, onStart);
    return () => window.removeEventListener(LOGOUT_START_EVENT, onStart);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-brand-cream/90 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label="Logging out"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-forest/10 bg-white px-8 py-7 shadow-xl">
        <span
          className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-[#166D46]/25 border-t-[#166D46]"
          aria-hidden
        />
        <span className="font-sans text-sm font-semibold text-[#166D46]">Logging out…</span>
      </div>
    </div>
  );
}

/** Storefront sign-out: show overlay, clear session, go to login. */
export async function signOutToLogin(): Promise<void> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOGOUT_START_EVENT));
  }
  try {
    await logoutSession();
  } finally {
    window.location.assign("/login");
  }
}
