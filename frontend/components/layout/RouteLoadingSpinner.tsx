"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const HIDE_MS = 450;
const NAV_START_MAX_MS = 2000;

/**
 * Single fade overlay for storefront navigation (mobile + desktop).
 * pointer-events-none so it never blocks taps / Link navigation.
 */
export function RouteLoadingSpinner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const safetyRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), HIDE_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onStart = () => {
      setVisible(true);
      window.clearTimeout(safetyRef.current);
      safetyRef.current = window.setTimeout(() => setVisible(false), NAV_START_MAX_MS);
    };
    window.addEventListener("sarveda-nav-start", onStart);
    return () => {
      window.removeEventListener("sarveda-nav-start", onStart);
      window.clearTimeout(safetyRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-brand-cream/55 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-forest/10 bg-white/95 px-8 py-7 shadow-xl">
        <span
          className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-brand-gold/25 border-t-brand-gold"
          aria-hidden
        />
        <span className="text-sm font-semibold text-brand-forest">Loading…</span>
      </div>
    </div>
  );
}

export function dispatchNavStart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sarveda-nav-start"));
  }
}
