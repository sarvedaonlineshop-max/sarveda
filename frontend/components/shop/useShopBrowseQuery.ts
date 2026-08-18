"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { SHOP_PRICE_MAX, SHOP_PRICE_MIN } from "@/lib/shop-merch-filters";
import type { ShopBrowseQuery } from "@/lib/shop-navigation";

function parseIntParam(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function readShopBrowseQuery(): ShopBrowseQuery {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    tag: params.get("tag") ?? "",
    minPrice: parseIntParam(params.get("minPrice")) ?? SHOP_PRICE_MIN,
    maxPrice: parseIntParam(params.get("maxPrice")) ?? SHOP_PRICE_MAX
  };
}

export function useShopBrowseQuery(server: ShopBrowseQuery = {}): ShopBrowseQuery {
  const pathname = usePathname();
  const [query, setQuery] = useState<ShopBrowseQuery>({
    q: server.q ?? "",
    tag: server.tag ?? "",
    minPrice: server.minPrice ?? SHOP_PRICE_MIN,
    maxPrice: server.maxPrice ?? SHOP_PRICE_MAX
  });

  useEffect(() => {
    const read = () => {
      const next = readShopBrowseQuery();
      setQuery((prev) =>
        prev.q === next.q &&
        prev.tag === next.tag &&
        prev.minPrice === next.minPrice &&
        prev.maxPrice === next.maxPrice
          ? prev
          : next
      );
    };
    read();

    window.addEventListener("popstate", read);
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      push(...args);
      queueMicrotask(read);
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace(...args);
      queueMicrotask(read);
    };
    return () => {
      window.removeEventListener("popstate", read);
      history.pushState = push;
      history.replaceState = replace;
    };
  }, [pathname, server.q, server.tag, server.minPrice, server.maxPrice]);

  return query;
}
