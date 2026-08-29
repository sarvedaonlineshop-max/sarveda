/**
 * Admin-only motion tokens.
 * Do NOT use for storefront — storefront keeps `lib/motion.ts` unchanged.
 */

export const adminMotionMs = {
  instant: 90,
  fast: 140,
  normal: 180,
  moderate: 220
} as const;

/** Seconds for Framer Motion (admin surfaces only). */
export const adminMotionSec = {
  instant: adminMotionMs.instant / 1000,
  fast: adminMotionMs.fast / 1000,
  normal: adminMotionMs.normal / 1000,
  moderate: adminMotionMs.moderate / 1000
} as const;

export const adminMotionEase = [0.22, 1, 0.36, 1] as const;

export const adminEaseCss = "cubic-bezier(0.22, 1, 0.36, 1)";

export const adminOverlayTransition = {
  duration: adminMotionSec.fast,
  ease: adminMotionEase
};

export const adminModalTransition = {
  duration: adminMotionSec.moderate,
  ease: adminMotionEase
};

export const adminModalExitTransition = {
  duration: adminMotionSec.fast,
  ease: adminMotionEase
};

export const adminToastTransition = {
  duration: adminMotionSec.normal,
  ease: adminMotionEase
};

export const adminToastExitTransition = {
  duration: adminMotionSec.fast,
  ease: adminMotionEase
};
