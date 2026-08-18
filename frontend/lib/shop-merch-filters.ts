export const SHOP_PRICE_MIN = 0;
export const SHOP_PRICE_MAX = 200_000;

export const SHOP_MERCH_FILTERS = [
  { slug: "best-sellers", label: "Best Sellers", dot: "#019875", border: "#019875" },
  { slug: "for-sound-therapists", label: "For Sound Therapists", dot: "#664820", border: "#664820" },
  { slug: "gift-options", label: "Gift Options", dot: "#D8B25D", border: "#D8B25D" },
  { slug: "kid-friendly", label: "Kid Friendly", dot: "#8D9373", border: "#8D9373" },
  { slug: "new-arrivals", label: "New Arrivals", dot: "#445505", border: "#445505" }
] as const;

export type ShopMerchFilterSlug = (typeof SHOP_MERCH_FILTERS)[number]["slug"];

export function shopMerchFilterLabel(slug: string | undefined): string | null {
  return SHOP_MERCH_FILTERS.find((f) => f.slug === slug)?.label ?? null;
}

export function isDefaultShopPriceRange(minPrice?: number, maxPrice?: number): boolean {
  const min = minPrice ?? SHOP_PRICE_MIN;
  const max = maxPrice ?? SHOP_PRICE_MAX;
  return min <= SHOP_PRICE_MIN && max >= SHOP_PRICE_MAX;
}
