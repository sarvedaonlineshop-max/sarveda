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
 * Only this variant's images when it has any. If none are linked to the variant,
 * fall back to shared images (no variantId), then to all images.
 */
export function galleryImagesForVariant<T extends GalleryImageRef>(
  variantId: string,
  images: T[]
): T[] {
  if (!images.length) return [];
  const variantImages = images.filter((im) => im.variantId === variantId);
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
