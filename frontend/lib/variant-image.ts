import type { ProductVariantDetail } from "@/lib/types";

export type GalleryImageRef = {
  url: string;
  altText: string | null;
};

/** Pick gallery index that best matches the selected variant (URL/alt heuristics). */
export function imageIndexForVariant(
  variant: ProductVariantDetail,
  images: GalleryImageRef[]
): number {
  if (!images.length) return 0;

  const needles: string[] = [];
  for (const row of variant.attributeValues) {
    const val = row.attributeValue.value;
    const slug = row.attributeValue.slug;
    needles.push(slug, val.toLowerCase(), val.toLowerCase().replace(/\s+/g, "-"));
    const words = val.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    needles.push(...words);
  }

  for (const needle of needles) {
    if (!needle || needle.length < 3) continue;
    const idx = images.findIndex((img) => {
      const u = img.url.toLowerCase();
      const a = (img.altText ?? "").toLowerCase();
      return u.includes(needle) || a.includes(needle);
    });
    if (idx >= 0) return idx;
  }

  let hash = 0;
  for (let i = 0; i < variant.id.length; i++) {
    hash = (hash + variant.id.charCodeAt(i)) % images.length;
  }
  return hash;
}
