/** Primary storefront navigation. */
export const MAIN_NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/store", label: "Store" },
  { href: "/events", label: "Events" },
  { href: "/corporate-wellness", label: "Corporate Wellness" },
  { href: "/insights", label: "Insights" },
  { href: "/contact", label: "Contact" }
] as const;

export function isMainNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  if (href === "/store" || href === "/shop") {
    return (
      pathname === "/store" ||
      pathname.startsWith("/store/") ||
      pathname === "/shop" ||
      pathname.startsWith("/shop/") ||
      pathname.startsWith("/product/") ||
      pathname.startsWith("/product-category/")
    );
  }
  if (href === "/courses") {
    return pathname === "/courses" || pathname.startsWith("/courses/") || pathname.startsWith("/course/");
  }
  if (href === "/events") {
    return pathname === "/events" || pathname.startsWith("/events/") || pathname.startsWith("/event/");
  }
  if (href === "/insights") {
    return pathname === "/insights" || pathname.startsWith("/insights/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
