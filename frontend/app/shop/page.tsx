import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
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
    fetchProductList(searchParams, { next: { revalidate: 60 } }, { limit: 24 })
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
    <>
      <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur md:border-stone-100 md:bg-stone-50/95">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <div className="hidden md:block">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
          </div>
          <h1 className="mt-0 font-serif text-2xl font-semibold tracking-tight text-stone-900 md:mt-6 md:text-4xl">
            Shop
          </h1>
          <p className="mt-2 hidden max-w-2xl text-stone-500 md:block">
            Instruments, botanicals, and mindful goods — chosen for depth of practice and everyday ritual.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl md:px-4 md:py-8 lg:px-8">
        <ShopMobileCategoryDrawer categories={sortedCategories} selectedSlug={categorySlug} />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
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
    </>
  );
}
