"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import type { ShopProductsPage } from "@/lib/shop-products-client";
import { categorySlugFromPathname } from "@/lib/shop-navigation";

import { ShopInfiniteProductGrid } from "./ShopInfiniteProductGrid";
import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  initialProducts: ShopProductsPage;
};

export function ShopProductGrid({ initialProducts }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { setProductsMeta } = useShopProductsMeta();

  const categorySlug = categorySlugFromPathname(pathname);
  const searchQ = searchParams.get("q") ?? "";

  useEffect(() => {
    setProductsMeta({
      loaded: initialProducts.items.length,
      total: initialProducts.total
    });
  }, [initialProducts.items.length, initialProducts.total, setProductsMeta]);

  return (
    <div className="pt-3 lg:pb-8 lg:pt-4">
      <ShopInfiniteProductGrid
        key={`${categorySlug ?? "all"}-${searchQ}`}
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
