"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";

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
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const startedAt = useRef(0);

  const beginNavigation = useCallback(
    (href: string) => {
      const nextPath = hrefPath(href);
      if (nextPath === pathname && !href.includes("?")) return;
      startedAt.current = Date.now();
      setPendingHref(href);
      setIsNavigating(true);
    },
    [pathname]
  );

  useEffect(() => {
    if (!pendingHref) return;
    const pendingPath = hrefPath(pendingHref);
    const arrived =
      pathname === pendingPath ||
      (pendingPath !== "/admin" && pathname.startsWith(`${pendingPath}/`));
    if (!arrived) return;

    const remaining = Math.max(0, 280 - (Date.now() - startedAt.current));
    const t = window.setTimeout(() => {
      setIsNavigating(false);
      setPendingHref(null);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [pathname, pendingHref]);

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
