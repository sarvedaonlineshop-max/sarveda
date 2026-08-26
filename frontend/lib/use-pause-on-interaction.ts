"use client";

import { useCallback, useRef, useState } from "react";

/** Pauses a callback-driven loop while the user hovers or touches the target. */
export function usePauseOnInteraction() {
  const [paused, setPaused] = useState(false);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = useCallback(() => setPaused(true), []);

  const resume = useCallback(() => setPaused(false), []);

  const bind = {
    onPointerEnter: pause,
    onPointerLeave: resume,
    onTouchStart: () => {
      pause();
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    },
    onTouchEnd: () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(resume, 1200);
    },
    onTouchCancel: () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchTimerRef.current = setTimeout(resume, 1200);
    }
  };

  return { paused, pause, resume, bind };
}
