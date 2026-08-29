"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AdminNavContextValue = {
  /** Pathname used for active styling (optimistic while navigating). */
  activePath: string;
  pendingHref: string | null;
  isNavigating: boolean;
  beginNavigation: (href: string) => void;
};

const AdminNavContext = createContext<AdminNavContextValue | null>(null);

function hrefPath(href: string): string {
  return href.split("?")[0] || href;
}

export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const beginNavigation = useCallback(
    (href: string) => {
      const nextPath = hrefPath(href);
      if (nextPath === pathname && !href.includes("?")) return;
      setPendingHref(href);
      setIsNavigating(true);
    },
    [pathname]
  );

  useEffect(() => {
    if (!pendingHref) return;
    const pendingPath = hrefPath(pendingHref);
    const pendingQuery = pendingHref.includes("?") ? pendingHref.split("?")[1] ?? "" : null;
    const pathArrived =
      pathname === pendingPath ||
      (pendingPath !== "/admin" && pathname.startsWith(`${pendingPath}/`));
    const queryArrived =
      pendingQuery === null || searchParams.toString() === pendingQuery;
    if (!pathArrived || !queryArrived) return;

    // Navigation feedback should follow the actual route, not impose an
    // artificial minimum delay. Clear on the next paint after the new route
    // commits so fast admin navigation stays fast.
    const frame = window.requestAnimationFrame(() => {
      setIsNavigating(false);
      setPendingHref(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, pendingHref, searchParams]);

  useEffect(() => {
    if (!isNavigating) return;
    const safety = window.setTimeout(() => {
      setIsNavigating(false);
      setPendingHref(null);
    }, 12_000);
    return () => window.clearTimeout(safety);
  }, [isNavigating]);

  const activePath = useMemo(() => {
    if (pendingHref) return hrefPath(pendingHref);
    return pathname;
  }, [pendingHref, pathname]);

  const value = useMemo(
    () => ({ activePath, pendingHref, isNavigating, beginNavigation }),
    [activePath, pendingHref, isNavigating, beginNavigation]
  );

  return <AdminNavContext.Provider value={value}>{children}</AdminNavContext.Provider>;
}

export function useAdminNav() {
  const ctx = useContext(AdminNavContext);
  if (!ctx) {
    throw new Error("useAdminNav must be used within AdminNavProvider");
  }
  return ctx;
}

/** Safe for links that may render outside the provider during SSR edge cases. */
export function useAdminNavOptional() {
  return useContext(AdminNavContext);
}
