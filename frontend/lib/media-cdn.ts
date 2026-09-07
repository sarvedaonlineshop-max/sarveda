/** Theme-relative path under sarveda.com/wp-content/themes/sarveda/assets/img/ */
export function corporateThemeAsset(relativePath: string): string {
  const rel = relativePath.replace(/^\//, "");
  const cdn = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, "");
  if (cdn) {
    return `${cdn}/media/corporate/${rel}`;
  }
  return `https://sarveda.com/wp-content/themes/sarveda/assets/img/${rel}`;
}

/** Rewrite WP upload URL to CDN if configured. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const cdn = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, "");
  if (!cdn) return url;
  if (url.startsWith(cdn)) return url;
  /**
   * Product images in DB are already absolute S3 URLs.
   * Blog/legacy rows still point at sarveda.com/wp-content/uploads — rewriting those
   * to `${cdn}/media/wp/uploads/...` 403s because blog banners were never uploaded to S3.
   * Keep the origin URL so Next/Image can load from sarveda.com.
   */
  return url;
}
