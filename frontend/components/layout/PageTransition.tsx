"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isShopBrowsePath } from "@/lib/shop-navigation";
import { pageTransition, pageVariants } from "@/lib/motion";

/** Set to `true` to re-enable Framer Motion fade/slide between storefront pages. */
export const ENABLE_PAGE_TRANSITIONS = false;

function skipPageMotion(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // Shared shop shell — fade would remount sidebar/toolbar.
  if (isShopBrowsePath(pathname)) return true;
  // PDP category/Shop links must not exit through AnimatePresence mode="wait",
  // which can leave the next route's children unmounted / stuck on a Suspense fallback.
  if (pathname.startsWith("/product/")) return true;
  return false;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const prevPathnameRef = useRef(pathname);
  const previousPathname = prevPathnameRef.current;

  useEffect(() => {
    prevPathnameRef.current = pathname;
  }, [pathname]);

  if (!ENABLE_PAGE_TRANSITIONS) {
    return <>{children}</>;
  }

  // Skip motion when either side of the navigation is shop/PDP (covers PDP → shop).
  if (skipPageMotion(pathname) || skipPageMotion(previousPathname)) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={reduceMotion ? false : "initial"}
        animate="animate"
        exit={reduceMotion ? undefined : "exit"}
        variants={pageVariants}
        transition={reduceMotion ? { duration: 0 } : pageTransition}
        className="motion-safe:will-change-transform"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
