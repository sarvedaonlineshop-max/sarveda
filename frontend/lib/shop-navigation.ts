export function shopPathForCategory(slug: string | undefined): string {
  return slug ? `/product-category/${encodeURIComponent(slug)}` : "/shop";
}

export function buildShopHref(slug: string | undefined, searchQ: string | undefined): string {
  const base = shopPathForCategory(slug);
  const q = searchQ?.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}

export function categorySlugFromPathname(pathname: string | null): string | undefined {
  if (!pathname?.startsWith("/product-category/")) return undefined;
  const raw = pathname.replace("/product-category/", "").split("/")[0] ?? "";
  return raw ? decodeURIComponent(raw) : undefined;
}

export function isShopBrowsePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/shop" || pathname.startsWith("/product-category/");
}
