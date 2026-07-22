import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ShopProductGrid } from "@/components/shop/ShopProductGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchCategoryBySlug, fetchProductList } from "@/lib/api";
import { breadcrumbJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

function categoryMetaDescription(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const plain = htmlToPlainText(raw);
  if (!plain) return fallback;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

export const revalidate = 60;
export const dynamicParams = true;

type Props = {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  let category: Awaited<ReturnType<typeof fetchCategoryBySlug>> = null;
  try {
    category = await fetchCategoryBySlug(params.slug, { next: { revalidate: 300 } });
  } catch {
    return { title: "Category" };
  }
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
  let category: Awaited<ReturnType<typeof fetchCategoryBySlug>> = null;
  try {
    category = await fetchCategoryBySlug(params.slug, { next: { revalidate: 300 } });
  } catch {
    /* EC2 unreachable during build */
  }
  if (!category) {
    notFound();
  }

  const listParams = { ...searchParams, category: params.slug };
  let list = {
    items: [] as Awaited<ReturnType<typeof fetchProductList>>["items"],
    pagination: { page: 1, limit: 48, total: 0, totalPages: 0 }
  };
  try {
    list = await fetchProductList(listParams, { next: { revalidate: 60 } }, { limit: 48 });
  } catch {
    /* Keep build green; ISR will refill when API is back */
  }

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
      <ShopProductGrid
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
