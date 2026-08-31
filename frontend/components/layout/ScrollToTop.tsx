"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

import { isShopBrowsePath } from "@/lib/shop-navigation";

/**
 * Pin the window to the top after soft navigations.
 *
 * Chrome (more than Safari) often keeps the previous page's scrollY when the App
 * Router swaps content in-place — e.g. deep scroll on /store → /product/... lands
 * mid/bottom of the PDP. Shop browse paths are excluded: they own scroll restore
 * via `shop-scroll-restore`.
 */
export function ScrollToTop() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (!pathname || isShopBrowsePath(pathname)) return;
    if (typeof window === "undefined") return;

    // Hash deep-links should keep native anchor behavior.
    if (window.location.hash) return;

    try {
      history.scrollRestoration = "manual";
    } catch {
      /* ignore */
    }

    const pinTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    pinTop();
    const raf = window.requestAnimationFrame(pinTop);
    // Late Chrome history / layout races (images, sticky header offset).
    const t0 = window.setTimeout(pinTop, 0);
    const t1 = window.setTimeout(pinTop, 50);
    const t2 = window.setTimeout(pinTop, 200);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}
