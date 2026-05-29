import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { ShopCategoryFilterSidebar } from "@/components/shop/ShopCategoryFilterSidebar";
import { ShopMobileCategoryDrawer } from "@/components/shop/ShopMobileCategoryDrawer";
import { ShopPagination } from "@/components/shop/Pagination";
import { ProductCard } from "@/components/shop/ProductCard";
import { fetchCategoryBySlug, fetchCategoryTree, fetchProductList } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
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
    fetchProductList(listParams, { next: { revalidate: 60 } })
  ]);

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
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-white md:border-[rgba(196,176,232,0.25)] md:bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <div className="hidden md:block">
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Shop", href: "/shop" },
                ...(category.parent
                  ? [
                      {
                        label: category.parent.name,
                        href: `/product-category/${category.parent.slug}`
                      }
                    ]
                  : []),
                { label: category.name }
              ]}
            />
          </div>
          <h1 className="display-text mt-0 font-serif text-2xl font-semibold tracking-tight text-brand-ink md:mt-6 md:text-4xl">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-2 max-w-2xl text-brand-mid md:text-base">{category.description}</p>
          ) : (
            <p className="mt-2 hidden max-w-2xl text-brand-muted md:block">
              Explore {category.name} — curated for practice and everyday ritual.
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-7xl md:px-4 md:py-8 lg:px-8">
        <ShopMobileCategoryDrawer categories={categories} selectedSlug={params.slug} />

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
            <ShopCategoryFilterSidebar categories={categories} selectedSlug={params.slug} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-3 px-4 text-sm text-brand-muted md:mb-6 md:px-0">
              Showing{" "}
              <span className="font-medium text-brand-ink">{list.items.length}</span> of{" "}
              <span className="font-medium text-brand-ink">{list.pagination.total}</span> products
            </p>

            {list.items.length === 0 ? (
              <p className="mx-4 rounded-2xl border border-dashed border-[rgba(196,176,232,0.25)] bg-white p-10 text-center text-brand-muted md:mx-0">
                No products in this category yet.{" "}
                <Link href="/shop" className="font-medium text-brand-violet underline hover:text-brand-violet">
                  Browse all products
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
                    basePath={`/product-category/${params.slug}`}
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
