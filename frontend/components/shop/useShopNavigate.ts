"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { buildShopHref, type ShopBrowseQuery } from "@/lib/shop-navigation";

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
    (nextSlug: string | undefined, query: ShopBrowseQuery) => {
      const href = buildShopHref(nextSlug, query);
      setIsPending(true);
      router.push(href, { scroll: false });
      window.setTimeout(() => setIsPending(false), 600);
    },
    [router]
  );

  return { navigate, isPending };
}
