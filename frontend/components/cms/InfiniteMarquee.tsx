"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  duration?: number;
  className?: string;
  trackClassName?: string;
  pauseOnHover?: boolean;
};

export function InfiniteMarquee({
  children,
  duration = 40,
  className = "",
  trackClassName = "",
  pauseOnHover = true
}: Props) {
  const [paused, setPaused] = useState(false);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = useCallback(() => {
    if (pauseOnHover) setPaused(true);
  }, [pauseOnHover]);

  const resume = useCallback(() => {
    if (pauseOnHover) setPaused(false);
  }, [pauseOnHover]);

  const onTouchStart = useCallback(() => {
    pause();
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
  }, [pause]);

  const onTouchEnd = useCallback(() => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(resume, 1200);
  }, [resume]);

  return (
    <div
      className={`overflow-hidden ${className}`}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className={`flex w-max ${trackClassName}`}
        style={{
          animation: `marquee ${duration}s linear infinite`,
          animationPlayState: paused ? "paused" : "running"
        }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
