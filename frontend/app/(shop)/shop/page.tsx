import type { Metadata } from "next";

import { ShopProductGrid } from "@/components/shop/ShopProductGrid";
import { fetchProductList } from "@/lib/api";
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
  const list = await fetchProductList(searchParams, { next: { revalidate: 60 } }, { limit: 48 });

  return (
    <ShopProductGrid
      initialProducts={{
        items: list.items,
        page: list.pagination.page,
        totalPages: list.pagination.totalPages,
        total: list.pagination.total
      }}
    />
  );
}
