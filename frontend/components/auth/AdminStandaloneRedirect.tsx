"use client";

import { useEffect } from "react";

import { fetchMe, isAdminRole } from "@/lib/auth-client";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari / installed web app
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * Installed PWA always launches at manifest start_url (`/`).
 * Admins who use the home-screen app for backoffice should land on /admin.
 */
export function AdminStandaloneRedirect() {
  useEffect(() => {
    if (!isStandaloneDisplay()) return;
    let cancelled = false;
    void fetchMe().then((me) => {
      if (cancelled || !me || !isAdminRole(me.role)) return;
      if (window.location.pathname === "/" || window.location.pathname === "") {
        window.location.replace("/admin");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
