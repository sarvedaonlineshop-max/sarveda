"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { buildShopHref } from "@/lib/shop-navigation";

/**
 * Soft-nav between shop browse URLs.
 * Do not wrap in startTransition — that + Suspense/useSearchParams left /shop hung.
 */
export function useShopNavigate() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const t = window.setTimeout(() => setIsPending(false), 4000);
    return () => window.clearTimeout(t);
  }, [isPending]);

  const navigate = useCallback(
    (nextSlug: string | undefined, nextSearchQ: string) => {
      const href = buildShopHref(nextSlug, nextSearchQ.trim() || undefined);
      setIsPending(true);
      router.push(href, { scroll: false });
      // Clear pending once the URL has updated (pathname/search change).
      window.setTimeout(() => setIsPending(false), 600);
    },
    [router]
  );

  return { navigate, isPending };
}
