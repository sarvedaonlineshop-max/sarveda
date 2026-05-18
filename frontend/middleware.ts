import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Preserve WooCommerce category URLs: /shop?category=slug → /product-category/slug */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/shop" || pathname === "/shop/") {
    const category = searchParams.get("category")?.trim();
    if (category) {
      const target = new URL(`/product-category/${encodeURIComponent(category)}`, request.url);
      const page = searchParams.get("page");
      if (page && page !== "1") target.searchParams.set("page", page);
      return NextResponse.redirect(target, 301);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/shop"]
};
