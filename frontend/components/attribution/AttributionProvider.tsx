"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import {
  captureAttributionOnLanding,
  isAttributionTrackedPath,
  recordAttributionPageView
} from "@/lib/attribution";

/**
 * Storefront-only first/last-touch + session pageview tracker.
 * Skips /admin and /api. Independent of GA4 / Meta.
 */
function AttributionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bootstrapped = useRef(false);
  const lastCountedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !isAttributionTrackedPath(pathname)) return;

    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    const referrer = typeof document !== "undefined" ? document.referrer : "";

    if (!bootstrapped.current) {
      bootstrapped.current = true;
      captureAttributionOnLanding({
        pathname,
        search,
        documentReferrer: referrer
      });
    } else {
      // SPA navigations: do not treat as new external entry (referrer stays prior page).
      captureAttributionOnLanding({
        pathname,
        search,
        documentReferrer: ""
      });
    }

    const key = `${pathname}${search}`;
    if (lastCountedPath.current === key) return;
    lastCountedPath.current = key;
    recordAttributionPageView(pathname);
  }, [pathname, searchParams]);

  return null;
}

export function AttributionProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AttributionTracker />
      </Suspense>
      {children}
    </>
  );
}
