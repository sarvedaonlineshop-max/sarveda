import type { Transition, Variants } from "framer-motion";

export const motionDurations = {
  fast: 0.18,
  base: 0.24,
  slow: 0.32
} as const;

export const pageTransition: Transition = {
  duration: motionDurations.base,
  ease: [0.22, 1, 0.36, 1]
};

export const drawerTransition: Transition = {
  duration: motionDurations.base,
  ease: [0.32, 0.72, 0, 1]
};

export const pageVariants: Variants = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 }
};

export const drawerPanelVariants = (side: "left" | "right"): Variants => ({
  initial: { x: side === "right" ? "100%" : "-100%" },
  animate: { x: 0 },
  exit: { x: side === "right" ? "100%" : "-100%" }
});

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};
