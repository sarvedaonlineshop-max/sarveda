"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import type { ShopProductsPage } from "@/lib/shop-products-client";
import { categorySlugFromPathname } from "@/lib/shop-navigation";

import { ShopInfiniteProductGrid } from "./ShopInfiniteProductGrid";
import { useLocationQueryParam } from "./useLocationQueryParam";
import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  initialProducts: ShopProductsPage;
  /** From the server page `searchParams` — preferred seed for ?q= */
  searchQ?: string;
  /** From the category route — preferred over pathname parse */
  categorySlug?: string;
};

export function ShopProductGrid({
  initialProducts,
  searchQ: serverSearchQ = "",
  categorySlug: categorySlugProp
}: Props) {
  const pathname = usePathname();
  const { setProductsMeta } = useShopProductsMeta();

  const categorySlug = categorySlugProp ?? categorySlugFromPathname(pathname);
  const searchQ = useLocationQueryParam("q", serverSearchQ);

  useEffect(() => {
    setProductsMeta({
      loaded: initialProducts.items.length,
      total: initialProducts.total
    });
  }, [initialProducts.items.length, initialProducts.total, setProductsMeta]);

  return (
    <div className="pt-3 lg:pb-8 lg:pt-4">
      <ShopInfiniteProductGrid
        key={`${categorySlug ?? "all"}-${searchQ}-${initialProducts.page}-${initialProducts.total}`}
        initialItems={initialProducts.items}
        initialPage={initialProducts.page}
        totalPages={initialProducts.totalPages}
        total={initialProducts.total}
        categorySlug={categorySlug}
        searchQ={searchQ || undefined}
        hideSummary
      />
    </div>
  );
}
