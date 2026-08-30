"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Wait before first paint — fast nav never flashes a loader. */
const SHOW_DELAY_MS = 200;
/** “Loading…” only after nav has been pending this long (from nav-start). */
const TEXT_DELAY_MS = 900;
/** Stuck-nav safety clear. */
const SAFETY_MAX_MS = 2000;

const FADE_IN_S = 0.16;
const FADE_OUT_S = 0.2;
const BREATH_S = 2;
const ORBIT_S = 1.3;

const MARK_SRC = "/brand/sarveda-mark.png";
/** ~34px wide; PNG is 40×68 → height ≈ 58. */
const MARK_W = 34;
const MARK_H = Math.round(MARK_W * (68 / 40));
const ORBIT_SIZE = 62;

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

  // Pathname change = navigation completed — cancel pending show; fade out if visible.
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
            style={{ gap: 13 }}
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
            <div
              className="relative flex items-center justify-center"
              style={{
                width: ORBIT_SIZE,
                height: ORBIT_SIZE,
                filter: "drop-shadow(0 0 10px rgba(185, 138, 62, 0.18))"
              }}
              aria-hidden
            >
              {/* Faint complete gold circle */}
              <svg
                className="absolute inset-0"
                width={ORBIT_SIZE}
                height={ORBIT_SIZE}
                viewBox="0 0 62 62"
                fill="none"
              >
                <circle
                  cx="31"
                  cy="31"
                  r="29"
                  stroke="#b98a3e"
                  strokeWidth="1.5"
                  opacity="0.22"
                />
              </svg>

              {/* Stronger travelling arc — only this layer rotates */}
              <motion.div
                className="absolute inset-0"
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={
                  reduceMotion
                    ? undefined
                    : { duration: ORBIT_S, ease: "linear", repeat: Infinity }
                }
              >
                <svg width={ORBIT_SIZE} height={ORBIT_SIZE} viewBox="0 0 62 62" fill="none">
                  <circle
                    cx="31"
                    cy="31"
                    r="29"
                    stroke="#b98a3e"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeDasharray={reduceMotion ? "36 146" : "32 150"}
                    opacity={reduceMotion ? 0.72 : 0.95}
                  />
                </svg>
              </motion.div>

              {/* Stationary upright mark — subtle breath (no spin) */}
              <motion.img
                src={MARK_SRC}
                alt=""
                width={MARK_W}
                height={MARK_H}
                decoding="async"
                draggable={false}
                className="relative z-[1] select-none object-contain"
                style={{ width: MARK_W, height: MARK_H }}
                animate={
                  reduceMotion
                    ? { opacity: 1, scale: 1 }
                    : { scale: [1, 1.035, 1], opacity: [0.88, 1, 0.88] }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: BREATH_S, ease: "easeInOut", repeat: Infinity }
                }
              />
            </div>

            <AnimatePresence>
              {showText ? (
                <motion.span
                  key="loading-copy"
                  className="text-[12px] font-medium tracking-[0.02em] text-brand-forest/75"
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
