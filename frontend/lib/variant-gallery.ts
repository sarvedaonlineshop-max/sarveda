import type { ProductVariantDetail } from "@/lib/types";

export type GalleryImageRef = {
  id?: string;
  url: string;
  altText: string | null;
  variantId?: string | null;
  position?: number;
  isPrimary?: boolean;
};

function normalizeGalleryUrl(url: string): string {
  return url.trim().split("?")[0]!.replace(/\/$/, "").toLowerCase();
}

/**
 * Variant featured image(s) first, then shared product gallery (Woo-style).
 * Previously: if a variant had any linked image, shared gallery was hidden — that
 * caused Handpan (and others) to show 1 thumb on demo while sarveda.com shows 7+.
 */
export function galleryImagesForVariant<T extends GalleryImageRef>(
  variantId: string,
  images: T[]
): T[] {
  if (!images.length) return [];

  const variantImages = images.filter((im) => im.variantId === variantId);
  const shared = images.filter((im) => !im.variantId);

  if (variantImages.length > 0 && shared.length > 0) {
    const seen = new Set(variantImages.map((im) => normalizeGalleryUrl(im.url)));
    const merged = [...variantImages];
    for (const img of shared) {
      const key = normalizeGalleryUrl(img.url);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(img);
      }
    }
    return merged;
  }

  if (variantImages.length > 0) return variantImages;
  if (shared.length > 0) return shared;
  return images;
}

export function resolveVariantVideoUrl(
  variant: { videoUrl?: string | null } | null | undefined,
  product: { videoUrl?: string | null }
): string | null {
  const v = variant?.videoUrl?.trim();
  if (v) return v;
  const p = product.videoUrl?.trim();
  return p || null;
}

export { imageIndexForVariant } from "@/lib/variant-image";
