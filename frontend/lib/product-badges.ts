import type { ProductListItem } from "./types";

function slugHash(slug: string): number {
  return slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

export type ProductBadge = { key: string; label: string };

/** Stable, lightweight merchandising labels until CMS flags exist. */
export function productListBadges(product: ProductListItem): ProductBadge[] {
  const badges: ProductBadge[] = [];
  if (product.productType === "DIGITAL") {
    badges.push({ key: "digital", label: "Digital" });
  }
  const h = slugHash(product.slug);
  if (h % 11 === 0) {
    badges.push({ key: "new", label: "New" });
  } else if (h % 17 === 0) {
    badges.push({ key: "bestseller", label: "Best Seller" });
  }
  return badges;
}
