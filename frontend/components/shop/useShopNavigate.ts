"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { buildShopHref } from "@/lib/shop-navigation";

export function useShopNavigate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (nextSlug: string | undefined, nextSearchQ: string) => {
      const href = buildShopHref(nextSlug, nextSearchQ.trim() || undefined);
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router]
  );

  return { navigate, isPending };
}
