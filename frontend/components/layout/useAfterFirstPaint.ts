"use client";

import { useEffect, useState } from "react";

/**
 * True after first paint / short idle — use to mount non-critical chrome
 * (bottom nav drawer motion, subscribe widget, route spinner) off the LCP path.
 */
export function useAfterFirstPaint(delayMs = 0): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const go = () => {
      if (cancelled) return;
      setReady(true);
    };

    const schedule = () => {
      if (delayMs > 0) {
        timer = setTimeout(go, delayMs);
        return;
      }
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => go(), { timeout: 1800 });
      } else {
        timer = setTimeout(go, 400);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer) clearTimeout(timer);
    };
  }, [delayMs]);

  return ready;
}
