import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ZONE_COOKIE, countryToZone, isValidZone } from "@/lib/currency";
import { detectCountryFromHeaders } from "@/lib/geo-zone";
import { resolveStorePathToProductRedirect } from "@/lib/legacy-woo-product-url";

const ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const AUTH_COOKIE = "sarveda_auth";

function detectCountryCode(request: NextRequest): string | null {
  const geoCountry = request.geo?.country?.trim();
  if (geoCountry) return geoCountry.toUpperCase();
  return detectCountryFromHeaders(request.headers);
}

function ensurePricingZoneCookie(request: NextRequest, response: NextResponse): void {
  const existing = request.cookies.get(ZONE_COOKIE)?.value;
  const isLoggedIn = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  const country = detectCountryCode(request);
  if (!country) return;

  const zone = countryToZone(country);

  // Logged-in shoppers: refresh zone from current geo on each visit.
  // Guests: set once on first visit (sticky 30 days).
  const shouldSet = isLoggedIn || !isValidZone(existing);
  if (!shouldSet) return;
  if (isValidZone(existing) && existing === zone) return;

  response.cookies.set({
    name: ZONE_COOKIE,
    value: zone,
    path: "/",
    maxAge: ZONE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

/** Preserve WooCommerce category URLs: /shop?category=slug → /product-category/slug */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Zoho API: always pass through to Next rewrites / route handlers (no edge auth).
  if (pathname === "/api/zoho" || pathname.startsWith("/api/zoho/")) {
    return NextResponse.next();
  }

  if (pathname === "/shop" || pathname === "/shop/") {
    const category = searchParams.get("category")?.trim();
    if (category) {
      const target = new URL(`/product-category/${encodeURIComponent(category)}`, request.url);
      const page = searchParams.get("page");
      if (page && page !== "1") target.searchParams.set("page", page);
      const redirect = NextResponse.redirect(target, 301);
      ensurePricingZoneCookie(request, redirect);
      return redirect;
    }
  }

  // Legacy Woo / Google Merchant PDPs: /store/.../{leaf}/ → 301 /product/{slug}
  // /store and /store/ stay as listing aliases (next.config rewrite → /shop).
  if (pathname === "/store" || pathname === "/store/") {
    const response = NextResponse.next();
    ensurePricingZoneCookie(request, response);
    return response;
  }
  if (pathname.startsWith("/store/")) {
    const redirectPath = resolveStorePathToProductRedirect(pathname, searchParams);
    if (redirectPath) {
      // Always internal /product/... — never absolute external hosts.
      const target = new URL(redirectPath, request.nextUrl.origin);
      const redirect = NextResponse.redirect(target, 301);
      ensurePricingZoneCookie(request, redirect);
      return redirect;
    }
    // Unresolved deep /store paths: pass through (rewrite may 404). Do not send to /.
  }

  const response = NextResponse.next();
  ensurePricingZoneCookie(request, response);
  return response;
}

export const config = {
  matcher: [
    "/api/zoho/:path*",
    "/shop",
    /*
     * Storefront pages (skip api, admin, static assets).
     * Sets `sarveda_zone` from Vercel/Cloudflare geo on first visit.
     */
    "/((?!api|admin|_next/static|_next/image|favicon.ico|sw.js|manifest.json|robots.txt|sitemap.xml|.*\\..*).*)"
  ]
};
