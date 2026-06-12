/** Read country code from CDN / edge headers (Vercel, Cloudflare). */
export function detectCountryFromHeaders(
  headers: Headers | { get(name: string): string | null }
): string | null {
  const fromHeader =
    headers.get("cf-ipcountry")?.trim() ||
    headers.get("x-vercel-ip-country")?.trim();
  if (fromHeader && fromHeader !== "XX") return fromHeader.toUpperCase();
  return null;
}
