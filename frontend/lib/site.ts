/** Canonical public site origin (no trailing slash). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** True only when the deployment is the live WooCommerce replacement domain. */
export function isProductionSite(): boolean {
  try {
    const host = new URL(getSiteUrl()).hostname.toLowerCase();
    return host === "sarveda.com" || host === "www.sarveda.com";
  } catch {
    return false;
  }
}

export function absoluteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${p}`;
}

export function canonical(path: string): string {
  return absoluteUrl(path);
}
