"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Mobile-only full-screen spinner while bottom-nav / tab changes settle.
 *  Desktop already uses Header’s PageLoadingSpinner — keep them from stacking. */
export function RouteLoadingSpinner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 450);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onStart = () => setVisible(true);
    window.addEventListener("sarveda-nav-start", onStart);
    return () => window.removeEventListener("sarveda-nav-start", onStart);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-brand-cream/35 backdrop-blur-[1px] md:hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-cream-dark border-t-[#108967]" />
    </div>
  );
}

export function dispatchNavStart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("sarveda-nav-start"));
  }
}
