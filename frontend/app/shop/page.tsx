import type { Metadata } from "next";
import { Suspense } from "react";

import { canonical, isProductionSite } from "@/lib/site";
import { ShopCategoryFilterSidebar } from "@/components/shop/ShopCategoryFilterSidebar";
import { ShopFiltersBar } from "@/components/shop/ShopFiltersBar";
import { ShopInfiniteProductGrid } from "@/components/shop/ShopInfiniteProductGrid";
import { ShopMobileCategoryDrawer } from "@/components/shop/ShopMobileCategoryDrawer";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";
import { sortShopCategories } from "@/lib/shop-categories";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse yoga, meditation, Ayurveda, and sound healing products — instruments, botanicals, and mindful goods at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/shop") }
};

type Props = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function ShopPage({ searchParams }: Props) {
  const [categories, list] = await Promise.all([
    fetchCategoryTree({ next: { revalidate: 300 } }),
    fetchProductList(searchParams, { next: { revalidate: 60 } }, { limit: 48 })
  ]);

  const sortedCategories = sortShopCategories(categories);
  const categorySlug =
    typeof searchParams.category === "string" ? searchParams.category : undefined;
  const searchQ =
    typeof searchParams.q === "string"
      ? searchParams.q
      : typeof searchParams.search === "string"
        ? searchParams.search
        : undefined;

  return (
    <main className="mx-auto max-w-7xl pb-16 pt-4 md:px-4 md:pb-14 md:pt-6 lg:px-8">
      <h1 className="sr-only">Shop</h1>
      <ShopMobileCategoryDrawer categories={sortedCategories} selectedSlug={categorySlug} />

      <div className="flex flex-col lg:flex-row lg:items-start lg:gap-10">
        <div className="hidden lg:block lg:sticky lg:top-24 lg:w-72 lg:flex-shrink-0 lg:self-start">
          <ShopCategoryFilterSidebar categories={sortedCategories} selectedSlug={categorySlug} />
        </div>

        <div className="min-w-0 flex-1">
          <Suspense fallback={null}>
            <ShopFiltersBar categorySlug={categorySlug} />
          </Suspense>
          <ShopInfiniteProductGrid
            initialItems={list.items}
            initialPage={list.pagination.page}
            totalPages={list.pagination.totalPages}
            total={list.pagination.total}
            categorySlug={categorySlug}
            searchQ={searchQ}
          />
        </div>
      </div>
    </main>
  );
}
