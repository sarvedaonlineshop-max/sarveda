"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { trackSpaPageView } from "@/lib/analytics";

function GtmSpaTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams?.toString() ?? "";
    const key = `${pathname}${search ? `?${search}` : ""}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    trackSpaPageView(pathname);
  }, [pathname, searchParams]);

  return null;
}

/** Pushes GTM/GA page_view on App Router navigations (Google Ads remarketing + SPA). */
export function GtmSpaTracker() {
  return (
    <Suspense fallback={null}>
      <GtmSpaTrackerInner />
    </Suspense>
  );
}
