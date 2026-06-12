"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import type { PublicUser } from "@/lib/auth-client";
import { fetchMe } from "@/lib/auth-client";
import { syncPricingZoneFromGeo } from "@/lib/pricing-zone";

export function useStorefrontSession(): PublicUser | null {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    if (
      !pathname ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup")
    ) {
      setSessionUser(null);
      return;
    }

    let cancelled = false;
    void fetchMe().then((user) => {
      if (cancelled) return;
      setSessionUser(user);
      if (user) void syncPricingZoneFromGeo();
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Re-check session when the tab becomes visible again (browser reopen / back from sleep).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (
        !pathname ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup")
      ) {
        return;
      }
      void fetchMe().then((user) => {
        setSessionUser(user);
        if (user) void syncPricingZoneFromGeo();
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pathname]);

  useEffect(() => {
    const onAuthChange = (event: Event) => {
      const detail = (event as CustomEvent<PublicUser | null>).detail;
      setSessionUser(detail ?? null);
    };
    window.addEventListener("sarveda-auth-changed", onAuthChange);
    return () => window.removeEventListener("sarveda-auth-changed", onAuthChange);
  }, []);

  return sessionUser;
}
