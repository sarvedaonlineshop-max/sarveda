"use client";

/**
 * Page transitions are disabled — keep this file free of framer-motion so the
 * storefront critical path does not pay for AnimatePresence on every load.
 * Set ENABLE_PAGE_TRANSITIONS and restore the motion implementation if needed.
 */
export const ENABLE_PAGE_TRANSITIONS = false;

export function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
