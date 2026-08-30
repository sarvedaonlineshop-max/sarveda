"use client";

import { motion, useReducedMotion } from "framer-motion";

const MARK_SRC = "/brand/sarveda-mark.png";
const MARK_W = 34;
const MARK_H = Math.round(MARK_W * (68 / 40));
const ORBIT_SIZE = 62;
const BREATH_S = 2;
const ORBIT_S = 1.3;

type Props = {
  /** Shown under the mark (always visible for logout; delayed for route nav). */
  label?: string | null;
  className?: string;
};

/**
 * Sarveda mark + gold orbit — shared by route loader and logout overlay.
 * Mark stays upright; only the arc rotates.
 */
export function SarvedaSignatureLoader({ label = null, className = "" }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`flex flex-col items-center ${className}`} style={{ gap: 13 }}>
      <div
        className="relative flex items-center justify-center"
        style={{
          width: ORBIT_SIZE,
          height: ORBIT_SIZE,
          filter: "drop-shadow(0 0 10px rgba(185, 138, 62, 0.18))"
        }}
        aria-hidden
      >
        <svg
          className="absolute inset-0"
          width={ORBIT_SIZE}
          height={ORBIT_SIZE}
          viewBox="0 0 62 62"
          fill="none"
        >
          <circle cx="31" cy="31" r="29" stroke="#b98a3e" strokeWidth="1.5" opacity="0.22" />
        </svg>

        <motion.div
          className="absolute inset-0"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={
            reduceMotion ? undefined : { duration: ORBIT_S, ease: "linear", repeat: Infinity }
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

      {label ? (
        <span className="text-[12px] font-medium tracking-[0.02em] text-brand-forest/75">{label}</span>
      ) : null}
    </div>
  );
}
