import type { ProductListItem } from "@/lib/types";

export type ShopProductsPage = {
  items: ProductListItem[];
  page: number;
  totalPages: number;
  total: number;
};

/** Client-side fetch against the public /api/products endpoint. */
export async function fetchShopProductsPage(params: {
  page: number;
  limit: number;
  categorySlug?: string;
  searchQ?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
}): Promise<ShopProductsPage> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.categorySlug) q.set("category", params.categorySlug);
  if (params.searchQ) q.set("q", params.searchQ);
  if (params.tag) q.set("tag", params.tag);
  if (params.minPrice != null && params.minPrice > 0) q.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null && params.maxPrice > 0 && params.maxPrice < 200000) {
    q.set("maxPrice", String(params.maxPrice));
  }
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
