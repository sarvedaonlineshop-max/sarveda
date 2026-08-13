import type { ProductVariantDetail } from "@/lib/types";

export type GalleryImageRef = {
  id?: string;
  url: string;
  altText: string | null;
  variantId?: string | null;
  position?: number;
  isPrimary?: boolean;
};

/**
 * When a variant has linked gallery rows, show only those (DO carousel per variation).
 * Otherwise fall back to shared product gallery (simple products / legacy imports).
 */
export function galleryImagesForVariant<T extends GalleryImageRef>(
  variantId: string,
  images: T[]
): T[] {
  if (!images.length) return [];

  const variantImages = images
    .filter((im) => im.variantId === variantId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (variantImages.length > 0) return variantImages;

  const shared = images.filter((im) => !im.variantId);
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
