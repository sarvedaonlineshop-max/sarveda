"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

import { isShopBrowsePath } from "@/lib/shop-navigation";
import { pageTransition, pageVariants } from "@/lib/motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  // Shop category/search navigation keeps a shared layout — page fade would remount sidebar + toolbar.
  if (isShopBrowsePath(pathname)) {
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
