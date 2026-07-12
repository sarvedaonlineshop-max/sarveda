"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { drawerPanelVariants, drawerTransition, overlayVariants } from "@/lib/motion";

type SlideDrawerProps = {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
  panelClassName?: string;
};

export function SlideDrawer({
  open,
  onClose,
  side = "right",
  title,
  subtitle,
  children,
  footer,
  ariaLabel,
  panelClassName = "max-w-md"
}: SlideDrawerProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex" aria-hidden={!open}>
          <motion.button
            type="button"
            className="absolute inset-0 bg-stone-950/45 md:bg-stone-900/50 md:backdrop-blur-[2px]"
            aria-label="Close panel"
            onClick={onClose}
            variants={overlayVariants}
            initial={reduceMotion ? false : "initial"}
            animate="animate"
            exit="exit"
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? title}
            className={`relative flex h-full w-full flex-col border-stone-200 bg-stone-50 shadow-2xl ${
              side === "right" ? "ml-auto border-l" : "mr-auto border-r"
            } ${panelClassName}`}
            variants={drawerPanelVariants(side)}
            initial={reduceMotion ? false : "initial"}
            animate="animate"
            exit="exit"
            transition={reduceMotion ? { duration: 0 } : drawerTransition}
          >
            <div className="flex items-center justify-between border-b border-stone-100 bg-white px-4 py-4">
              <div>
                <h2 className="font-serif text-xl font-semibold text-stone-900">{title}</h2>
                {subtitle ? <p className="text-xs text-stone-500">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 min-w-[44px] items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                aria-label="Close panel"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            {footer ? <div className="border-t border-stone-100 bg-white safe-area-pb">{footer}</div> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
