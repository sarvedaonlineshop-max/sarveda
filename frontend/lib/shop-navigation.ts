export function shopPathForCategory(slug: string | undefined): string {
  return slug ? `/product-category/${encodeURIComponent(slug)}` : "/shop";
}

export type ShopBrowseQuery = {
  q?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
};

export function buildShopHref(slug: string | undefined, query: ShopBrowseQuery = {}): string {
  const base = shopPathForCategory(slug);
  const params = new URLSearchParams();
  const q = query.q?.trim();
  if (q) params.set("q", q);
  if (query.tag?.trim()) params.set("tag", query.tag.trim());
  if (query.minPrice != null && query.minPrice > 0) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice != null && query.maxPrice > 0 && query.maxPrice < 200000) {
    params.set("maxPrice", String(query.maxPrice));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function categorySlugFromPathname(pathname: string | null): string | undefined {
  if (!pathname?.startsWith("/product-category/")) return undefined;
  const raw = pathname.replace("/product-category/", "").split("/")[0] ?? "";
  return raw ? decodeURIComponent(raw) : undefined;
}

export function isShopBrowsePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/shop" || pathname.startsWith("/product-category/");
}
