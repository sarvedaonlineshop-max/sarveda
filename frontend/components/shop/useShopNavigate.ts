"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { buildShopHref } from "@/lib/shop-navigation";

/** Soft-nav between shop browse URLs without getting stuck in a pending Suspense state. */
export function useShopNavigate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingStuck, setPendingStuck] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setPendingStuck(false);
      return;
    }
    const t = setTimeout(() => setPendingStuck(true), 8000);
    return () => clearTimeout(t);
  }, [isPending]);

  const navigate = useCallback(
    (nextSlug: string | undefined, nextSearchQ: string) => {
      const href = buildShopHref(nextSlug, nextSearchQ.trim() || undefined);
      setPendingStuck(false);
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router]
  );

  return { navigate, isPending: isPending && !pendingStuck };
}
