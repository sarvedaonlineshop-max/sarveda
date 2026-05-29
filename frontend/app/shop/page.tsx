import type { Metadata } from "next";
import Link from "next/link";

import { PageListHero } from "@/components/layout/PageListHero";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ShopCategoryFilterSidebar } from "@/components/shop/ShopCategoryFilterSidebar";
import { ShopMobileCategoryDrawer } from "@/components/shop/ShopMobileCategoryDrawer";
import { ShopPagination } from "@/components/shop/Pagination";
import { ProductCard } from "@/components/shop/ProductCard";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

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
    fetchProductList(searchParams, { next: { revalidate: 60 } })
  ]);

  const categorySlug =
    typeof searchParams.category === "string" ? searchParams.category : undefined;

  return (
    <>
      <PageListHero
        eyebrow="Store"
        title={
          <>
            Shop <span className="italic text-brand-lavender">the collection</span>
          </>
        }
        subtitle="Instruments, botanicals, and mindful goods — chosen for depth of practice and everyday ritual."
        topSlot={
          <div className="mb-4 hidden md:block">
            <Breadcrumbs variant="onDark" items={[{ label: "Home", href: "/" }, { label: "Shop" }]} />
          </div>
        }
      />

      <main className="bg-brand-bg md:mx-auto md:max-w-7xl md:px-4 md:py-8 lg:px-8">
        <ShopMobileCategoryDrawer categories={categories} selectedSlug={categorySlug} />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
            <ShopCategoryFilterSidebar categories={categories} selectedSlug={categorySlug} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-3 px-4 text-sm font-light text-brand-mid md:mb-6 md:px-0">
              Showing <span className="font-medium text-brand-ink">{list.items.length}</span> of{" "}
              <span className="font-medium text-brand-ink">{list.pagination.total}</span> products
              {categorySlug ? (
                <>
                  {" "}
                  <span className="text-brand-muted">·</span> filtered by{" "}
                  <span className="font-medium text-brand-violet">{categorySlug.replace(/-/g, " ")}</span>
                </>
              ) : null}
            </p>

            {list.items.length === 0 ? (
              <p className="mx-4 rounded-2xl border border-dashed border-[rgba(196,176,232,0.35)] bg-brand-ivory p-10 text-center text-brand-mid md:mx-0">
                No products match this filter yet.{" "}
                <Link href="/shop" className="font-medium text-brand-violet underline hover:text-brand-violet-mid">
                  Clear filters
                </Link>
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-3 px-3 md:grid-cols-2 md:gap-6 md:px-0 lg:grid-cols-3 lg:gap-8">
                  {list.items.map((product) => (
                    <li key={product.id}>
                      <ProductCard product={product} />
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-8 md:px-0">
                  <ShopPagination
                    page={list.pagination.page}
                    totalPages={list.pagination.totalPages}
                    categorySlug={categorySlug}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
