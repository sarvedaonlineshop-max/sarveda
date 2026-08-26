"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { usePauseOnInteraction } from "@/lib/use-pause-on-interaction";

type Props = {
  children: ReactNode;
  /** Pixels per frame at ~60fps (~0.5–1.2 feels natural). */
  speed?: number;
  className?: string;
  trackClassName?: string;
};

/**
 * Continuous horizontal logo/card rail. Auto-scrolls via RAF, pauses on hover/touch,
 * and remains manually scrollable (drag / trackpad / touch) while paused or anytime.
 */
export function AutoScrollRail({
  children,
  speed = 0.55,
  className = "",
  trackClassName = ""
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const { paused, bind } = usePauseOnInteraction();

  useEffect(() => {
    if (paused) return;

    const step = () => {
      const el = scrollerRef.current;
      if (!el) return;

      const loopWidth = el.scrollWidth / 2;
      if (loopWidth <= el.clientWidth + 4) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      el.scrollLeft += speed;
      if (el.scrollLeft >= loopWidth) {
        el.scrollLeft -= loopWidth;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, speed]);

  return (
    <div className={className} {...bind}>
      <div
        ref={scrollerRef}
        className={`flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${trackClassName}`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
