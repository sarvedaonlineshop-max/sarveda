"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { SarvedaSignatureLoader } from "@/components/brand/SarvedaSignatureLoader";
import { logoutSession } from "@/lib/auth-client";

export const LOGOUT_START_EVENT = "sarveda-logout-start";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Full-screen Sarveda signature overlay while signing out.
 * Mount once near the app root. Trigger via {@link signOutToLogin}.
 */
export function LogoutTransitionOverlay() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();
  const fade = reduceMotion ? 0.08 : 0.18;

  useEffect(() => {
    const onStart = () => setVisible(true);
    window.addEventListener(LOGOUT_START_EVENT, onStart);
    return () => window.removeEventListener(LOGOUT_START_EVENT, onStart);
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="sarveda-logout"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-brand-cream/60 backdrop-blur-[1.5px]"
          role="status"
          aria-live="polite"
          aria-label="Logging out"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: fade, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: fade, ease: EASE } }}
        >
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={
              reduceMotion
                ? { opacity: 1, transition: { duration: fade, ease: EASE } }
                : { opacity: 1, scale: 1, transition: { duration: fade, ease: EASE } }
            }
          >
            <SarvedaSignatureLoader label="Logging out…" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Storefront sign-out: show overlay, clear session, go to login. */
export async function signOutToLogin(): Promise<void> {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOGOUT_START_EVENT));
  }
  try {
    await logoutSession();
  } finally {
    window.location.assign("/login");
  }
}
