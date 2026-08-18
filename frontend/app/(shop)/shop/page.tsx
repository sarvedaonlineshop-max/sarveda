import type { Metadata } from "next";

import { ShopProductGrid } from "@/components/shop/ShopProductGrid";
import { fetchProductList } from "@/lib/api";
import type { ProductListResponse } from "@/lib/types";
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

const emptyList: ProductListResponse = {
  items: [],
  pagination: { page: 1, limit: 48, total: 0, totalPages: 0 }
};

function firstSearchParam(
  value: string | string[] | undefined
): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default async function ShopPage({ searchParams }: Props) {
  let list = emptyList;
  try {
    list = await fetchProductList(searchParams, { next: { revalidate: 60 } }, { limit: 48 });
  } catch {
    /* Build/ISR must not fail when EC2 is down — page revalidates on next request */
  }

  return (
    <ShopProductGrid
      initialProducts={{
        items: list.items,
        page: list.pagination.page,
        totalPages: list.pagination.totalPages,
        total: list.pagination.total
      }}
      searchQ={firstSearchParam(searchParams.q)}
      tag={firstSearchParam(searchParams.tag)}
      minPrice={Number.parseInt(firstSearchParam(searchParams.minPrice), 10) || undefined}
      maxPrice={Number.parseInt(firstSearchParam(searchParams.maxPrice), 10) || undefined}
    />
  );
}
