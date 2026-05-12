"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import type { PublicUser } from "@/lib/auth-client";
import { fetchMe } from "@/lib/auth-client";

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
      if (!cancelled) setSessionUser(user);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return sessionUser;
}
