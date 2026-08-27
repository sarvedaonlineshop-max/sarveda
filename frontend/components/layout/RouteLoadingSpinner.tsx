"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** Hide shortly after the new route commits so content can paint. */
const HIDE_AFTER_ROUTE_MS = 180;
/** Safety if navigation never settles. */
const NAV_START_MAX_MS = 2500;

/**
 * Single full-screen fade + spinner for storefront nav (header + bottom nav).
 * Do not also render a second overlay in Header — that caused the double loader.
 */
export function RouteLoadingSpinner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const safetyTimer = useRef<number | undefined>(undefined);
  const navigating = useRef(false);

  useEffect(() => {
    const clearTimers = () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(safetyTimer.current);
    };

    const onStart = () => {
      navigating.current = true;
      clearTimers();
      setVisible(true);
      safetyTimer.current = window.setTimeout(() => {
        navigating.current = false;
        setVisible(false);
      }, NAV_START_MAX_MS);
    };

    window.addEventListener("sarveda-nav-start", onStart);
    return () => {
      window.removeEventListener("sarveda-nav-start", onStart);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!navigating.current) return;
    window.clearTimeout(hideTimer.current);
    window.clearTimeout(safetyTimer.current);
    hideTimer.current = window.setTimeout(() => {
      navigating.current = false;
      setVisible(false);
    }, HIDE_AFTER_ROUTE_MS);
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-brand-cream/60 backdrop-blur-[2px] transition-opacity duration-200"
      role="status"
      aria-live="polite"
      aria-busy="true"
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
