/** Theme-relative path under sarveda.com/wp-content/themes/sarveda/assets/img/ */
export function corporateThemeAsset(relativePath: string): string {
  const rel = relativePath.replace(/^\//, "");
  const cdn = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, "");
  if (cdn) {
    return `${cdn}/media/corporate/${rel}`;
  }
  return `https://sarveda.com/wp-content/themes/sarveda/assets/img/${rel}`;
}

const WP_UPLOADS_RE = /^https?:\/\/(?:www\.)?sarveda\.com\/wp-content\/uploads\//i;

/**
 * After DNS cutover, `sarveda.com/wp-content/uploads/...` no longer hits WordPress.
 * Route those through Express (`/api/media/legacy-uploads/...`) which serves S3 or DO.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (WP_UPLOADS_RE.test(trimmed)) {
    const rel = trimmed.replace(WP_UPLOADS_RE, "");
    return `/api/media/legacy-uploads/${rel}`;
  }
  const cdn = process.env.NEXT_PUBLIC_MEDIA_CDN_URL?.replace(/\/$/, "");
  if (cdn && trimmed.startsWith(cdn)) return trimmed;
  return trimmed;
}
