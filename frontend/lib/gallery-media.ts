import { parseVideoSource } from "@/lib/video-embed";

/** YouTube/Vimeo/file URLs stored as ProductImage.url for carousel video slots. */
export function isGalleryVideoUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(t)) return true;
  return parseVideoSource(t).type === "file" && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(t);
}

export function galleryHasVideoItems(
  images: ReadonlyArray<{ url: string }>
): boolean {
  return images.some((im) => isGalleryVideoUrl(im.url));
}
