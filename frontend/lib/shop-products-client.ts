import type { ProductListItem } from "@/lib/types";

export type ShopProductsPage = {
  items: ProductListItem[];
  page: number;
  totalPages: number;
  total: number;
};

/** Client-side fetch against the existing public /api/products endpoint — no backend changes. */
export async function fetchShopProductsPage(params: {
  page: number;
  limit: number;
  categorySlug?: string;
  searchQ?: string;
}): Promise<ShopProductsPage> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.categorySlug) q.set("category", params.categorySlug);
  if (params.searchQ) q.set("q", params.searchQ);
  const res = await fetch(`/api/products?${q.toString()}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Failed to load products");
  return {
    items: json.data.items as ProductListItem[],
    page: json.data.pagination.page as number,
    totalPages: json.data.pagination.totalPages as number,
    total: json.data.pagination.total as number
  };
}
