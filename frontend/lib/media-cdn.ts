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
  const wpPrefix = "https://sarveda.com/wp-content/uploads/";
  if (url.startsWith(wpPrefix)) {
    const rest = url.slice(wpPrefix.length);
    return `${cdn}/media/wp/uploads/${rest}`;
  }
  return url;
}
