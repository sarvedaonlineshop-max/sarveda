"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SarvedaSignatureLoader } from "@/components/brand/SarvedaSignatureLoader";

/** Wait before first paint — fast nav never flashes a loader. */
const SHOW_DELAY_MS = 200;
/** “Loading…” only after nav has been pending this long (from nav-start). */
const TEXT_DELAY_MS = 900;
/** Stuck-nav safety clear. */
const SAFETY_MAX_MS = 2000;

const FADE_IN_S = 0.16;
const FADE_OUT_S = 0.2;

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Single Sarveda signature overlay for storefront navigation (mobile + desktop).
 * pointer-events-none so it never blocks taps / Link navigation.
 */
export function RouteLoadingSpinner() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [showText, setShowText] = useState(false);
  const visibleRef = useRef(false);

  const showTimerRef = useRef<number | undefined>(undefined);
  const textTimerRef = useRef<number | undefined>(undefined);
  const safetyTimerRef = useRef<number | undefined>(undefined);

  function clearPendingTimers() {
    window.clearTimeout(showTimerRef.current);
    window.clearTimeout(textTimerRef.current);
    window.clearTimeout(safetyTimerRef.current);
    showTimerRef.current = undefined;
    textTimerRef.current = undefined;
    safetyTimerRef.current = undefined;
  }

  function hideLoader() {
    clearPendingTimers();
    visibleRef.current = false;
    setVisible(false);
    setShowText(false);
  }

  useEffect(() => {
    hideLoader();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only pathname
  }, [pathname]);

  useEffect(() => {
    const onStart = () => {
      clearPendingTimers();
      setShowText(false);

      const alreadyShowing = visibleRef.current;

      if (alreadyShowing) {
        textTimerRef.current = window.setTimeout(() => {
          setShowText(true);
        }, TEXT_DELAY_MS);
      } else {
        showTimerRef.current = window.setTimeout(() => {
          visibleRef.current = true;
          setVisible(true);
          textTimerRef.current = window.setTimeout(() => {
            setShowText(true);
          }, Math.max(0, TEXT_DELAY_MS - SHOW_DELAY_MS));
        }, SHOW_DELAY_MS);
      }

      safetyTimerRef.current = window.setTimeout(() => {
        hideLoader();
      }, SAFETY_MAX_MS);
    };

    window.addEventListener("sarveda-nav-start", onStart);
    return () => {
      window.removeEventListener("sarveda-nav-start", onStart);
      clearPendingTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fadeIn = reduceMotion ? 0.08 : FADE_IN_S;
  const fadeOut = reduceMotion ? 0.08 : FADE_OUT_S;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="sarveda-route-loader"
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-brand-cream/60 backdrop-blur-[1.5px]"
          role="status"
          aria-live="polite"
          aria-label="Loading page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: fadeIn, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: fadeOut, ease: EASE } }}
        >
          <motion.div
            className="flex flex-col items-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: { duration: fadeIn, ease: EASE } }
                : { opacity: 1, scale: 1, transition: { duration: fadeIn, ease: EASE } }
            }
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: fadeOut, ease: EASE } }
                : { opacity: 0, scale: 0.98, transition: { duration: fadeOut, ease: EASE } }
            }
          >
            <SarvedaSignatureLoader label={null} />
            <AnimatePresence>
              {showText ? (
                <motion.span
                  key="loading-copy"
                  className="mt-[13px] text-[12px] font-medium tracking-[0.02em] text-brand-forest/75"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: EASE }}
                >
                  Loading…
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function dispatchNavStart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sarveda-nav-start"));
  }
}
