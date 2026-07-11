import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/seo/JsonLd";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
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
      <ShopBrowser
        categories={sortShopCategories(categories)}
        initialCategorySlug={params.slug}
        initialSearchQ={searchQ}
        initialProducts={{
          items: list.items,
          page: list.pagination.page,
          totalPages: list.pagination.totalPages,
          total: list.pagination.total
        }}
      />
    </>
  );
}
