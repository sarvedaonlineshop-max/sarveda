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

/** Show the first video as the second slide. Leaves the stored gallery order alone. */
export function placeFirstVideoSecond<T>(items: readonly T[], isVideo: (item: T) => boolean): T[] {
  if (items.length < 2) return items.slice();
  const videoAt = items.findIndex(isVideo);
  if (videoAt < 0 || videoAt === 1) return items.slice();
  const next = items.slice();
  const [video] = next.splice(videoAt, 1);
  next.splice(1, 0, video as T);
  return next;
}
