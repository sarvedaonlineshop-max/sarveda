import type { Metadata } from "next";

import { canonical, isProductionSite } from "@/lib/site";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
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

  const categorySlug =
    typeof searchParams.category === "string" ? searchParams.category : undefined;
  const searchQ =
    typeof searchParams.q === "string"
      ? searchParams.q
      : typeof searchParams.search === "string"
        ? searchParams.search
        : undefined;

  return (
    <ShopBrowser
      categories={sortShopCategories(categories)}
      initialCategorySlug={categorySlug}
      initialSearchQ={searchQ}
      initialProducts={{
        items: list.items,
        page: list.pagination.page,
        totalPages: list.pagination.totalPages,
        total: list.pagination.total
      }}
    />
  );
}
