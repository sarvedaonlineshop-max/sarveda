import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/JsonLd";
import { ShopCategoryFilterSidebar } from "@/components/shop/ShopCategoryFilterSidebar";
import { ShopFiltersBar } from "@/components/shop/ShopFiltersBar";
import { ShopInfiniteProductGrid } from "@/components/shop/ShopInfiniteProductGrid";
import { ShopMobileCategoryDrawer } from "@/components/shop/ShopMobileCategoryDrawer";
import { fetchCategoryBySlug, fetchCategoryTree, fetchProductList } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { sortShopCategories } from "@/lib/shop-categories";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

function categoryMetaDescription(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const plain = htmlToPlainText(raw);
  if (!plain) return fallback;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

/** ISR only — do not combine with generateStaticParams or cache: no-store (causes DYNAMIC_SERVER_USAGE on Vercel). */
export const revalidate = 60;
export const dynamicParams = true;

type Props = {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await fetchCategoryBySlug(params.slug, { next: { revalidate: 300 } });
  if (!category) {
    return { title: "Category" };
  }
  const title = category.seoTitle || category.name;
  const description = categoryMetaDescription(
    category.seoDescription || category.description,
    `Shop ${category.name} at Sarveda.`
  );
  return {
    title,
    description,
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: category.imageUrl ? [{ url: category.imageUrl }] : undefined,
      siteName: "Sarveda"
    },
    alternates: {
      canonical: canonical(`/product-category/${params.slug}`)
    }
  };
}

export default async function ProductCategoryPage({ params, searchParams }: Props) {
  const category = await fetchCategoryBySlug(params.slug, { next: { revalidate: 300 } });
  if (!category) {
    notFound();
  }

  const listParams = { ...searchParams, category: params.slug };
  const [categories, list] = await Promise.all([
    fetchCategoryTree({ next: { revalidate: 300 } }),
    fetchProductList(listParams, { next: { revalidate: 60 } }, { limit: 48 })
  ]);
  const sortedCategories = sortShopCategories(categories);

  const searchQ =
    typeof searchParams.q === "string"
      ? searchParams.q
      : typeof searchParams.search === "string"
        ? searchParams.search
        : undefined;

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Shop", url: absoluteUrl("/shop") },
    ...(category.parent
      ? [
          {
            name: category.parent.name,
            url: absoluteUrl(`/product-category/${category.parent.slug}`)
          }
        ]
      : []),
    { name: category.name, url: absoluteUrl(`/product-category/${params.slug}`) }
  ];

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />

      {/* Same app-style shell as /shop — no hero block, shared sidebar/grid/pagination-free layout. */}
      <main className="mx-auto max-w-7xl pb-16 pt-4 md:px-4 md:pb-14 md:pt-6 lg:px-8">
        <h1 className="sr-only">{category.name}</h1>
        <ShopMobileCategoryDrawer categories={sortedCategories} selectedSlug={params.slug} />

        <div className="flex flex-col lg:flex-row lg:items-start lg:gap-10">
          <div className="hidden lg:block lg:sticky lg:top-24 lg:w-72 lg:flex-shrink-0 lg:self-start">
            <ShopCategoryFilterSidebar categories={sortedCategories} selectedSlug={params.slug} />
          </div>

          <div className="min-w-0 flex-1">
            <Suspense fallback={null}>
              <ShopFiltersBar categorySlug={params.slug} />
            </Suspense>
            <ShopInfiniteProductGrid
              initialItems={list.items}
              initialPage={list.pagination.page}
              totalPages={list.pagination.totalPages}
              total={list.pagination.total}
              categorySlug={params.slug}
              searchQ={searchQ}
            />
          </div>
        </div>
      </main>
    </>
  );
}
