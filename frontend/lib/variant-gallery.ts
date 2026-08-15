import type { ProductVariantDetail } from "@/lib/types";

export type GalleryImageRef = {
  id?: string;
  url: string;
  altText: string | null;
  variantId?: string | null;
  position?: number;
  isPrimary?: boolean;
};

function dedupeByUrl<T extends GalleryImageRef>(images: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const im of images) {
    if (seen.has(im.url)) continue;
    seen.add(im.url);
    out.push(im);
  }
  return out;
}

/**
 * Variable products with DO carousel: show only that variant's linked rows (2+ images).
 * Simple / legacy imports often have one variant thumb plus shared gallery — merge those.
 */
export function galleryImagesForVariant<T extends GalleryImageRef>(
  variantId: string,
  images: T[]
): T[] {
  if (!images.length) return [];

  const variantImages = images
    .filter((im) => im.variantId === variantId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const shared = images
    .filter((im) => !im.variantId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  if (variantImages.length >= 2) return variantImages;

  if (variantImages.length === 1 && shared.length > 0) {
    return dedupeByUrl([...variantImages, ...shared]);
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

export function resolveVariantAudioUrl(
  variant: { audioUrl?: string | null } | null | undefined,
  product: { audioUrl?: string | null }
): string | null {
  const v = variant?.audioUrl?.trim();
  if (v) return v;
  const p = product.audioUrl?.trim();
  return p || null;
}

export { imageIndexForVariant } from "@/lib/variant-image";
