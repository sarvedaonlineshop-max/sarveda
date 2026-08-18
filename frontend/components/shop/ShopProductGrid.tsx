"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import type { ShopProductsPage } from "@/lib/shop-products-client";
import { categorySlugFromPathname } from "@/lib/shop-navigation";
import { SHOP_PRICE_MAX, SHOP_PRICE_MIN } from "@/lib/shop-merch-filters";

import { ShopInfiniteProductGrid } from "./ShopInfiniteProductGrid";
import { useShopBrowseQuery } from "./useShopBrowseQuery";
import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  initialProducts: ShopProductsPage;
  searchQ?: string;
  categorySlug?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
};

export function ShopProductGrid({
  initialProducts,
  searchQ: serverSearchQ = "",
  categorySlug: categorySlugProp,
  tag: serverTag = "",
  minPrice: serverMin = SHOP_PRICE_MIN,
  maxPrice: serverMax = SHOP_PRICE_MAX
}: Props) {
  const pathname = usePathname();
  const { setProductsMeta } = useShopProductsMeta();
  const browse = useShopBrowseQuery({
    q: serverSearchQ,
    tag: serverTag,
    minPrice: serverMin,
    maxPrice: serverMax
  });

  const categorySlug = categorySlugProp ?? categorySlugFromPathname(pathname);
  const searchQ = browse.q ?? "";
  const tag = browse.tag ?? "";
  const minPrice = browse.minPrice ?? SHOP_PRICE_MIN;
  const maxPrice = browse.maxPrice ?? SHOP_PRICE_MAX;

  useEffect(() => {
    setProductsMeta({
      loaded: initialProducts.items.length,
      total: initialProducts.total
    });
  }, [initialProducts.items.length, initialProducts.total, setProductsMeta]);

  return (
    <div className="pt-3 lg:pb-8 lg:pt-4">
      <ShopInfiniteProductGrid
        key={`${categorySlug ?? "all"}-${searchQ}-${tag}-${minPrice}-${maxPrice}-${initialProducts.page}-${initialProducts.total}`}
        initialItems={initialProducts.items}
        initialPage={initialProducts.page}
        totalPages={initialProducts.totalPages}
        total={initialProducts.total}
        categorySlug={categorySlug}
        searchQ={searchQ || undefined}
        tag={tag || undefined}
        minPrice={minPrice}
        maxPrice={maxPrice}
        hideSummary
      />
    </div>
  );
}
