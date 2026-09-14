import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ZONE_COOKIE, countryToZone, isValidZone } from "@/lib/currency";
import { detectCountryFromHeaders } from "@/lib/geo-zone";
import { resolveNestedCategoryRedirect } from "@/lib/legacy-woo-category-url";
import { resolveStorePathToProductRedirect } from "@/lib/legacy-woo-product-url";

const ZONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const AUTH_COOKIE = "sarveda_auth";
const MAINT_BYPASS_COOKIE = "sarveda_maint_bypass";

function isMaintenanceModeEnabled(): boolean {
  const value = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function maintenanceBypassSecret(): string | null {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET?.trim();
  return secret || null;
}

function hasMaintenanceBypass(request: NextRequest): boolean {
  const secret = maintenanceBypassSecret();
  if (!secret) return false;
  if (request.cookies.get(MAINT_BYPASS_COOKIE)?.value === secret) return true;
  if (request.nextUrl.searchParams.get("maint_bypass") === secret) return true;
  return false;
}

function maintenanceHtmlResponse(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Sarveda — brief maintenance</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(160deg, #f7f3eb 0%, #e8f0ea 55%, #dfece3 100%);
      color: #1f3d2f;
    }
    main { max-width: 32rem; padding: 2rem; text-align: center; }
    h1 { font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 600; margin: 0 0 0.75rem; }
    p { font-family: system-ui, sans-serif; font-size: 1.05rem; line-height: 1.55; margin: 0; color: #3a5548; }
    .brand { font-family: system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
      font-size: 0.75rem; margin-bottom: 1.25rem; color: #5f7a6b; }
  </style>
</head>
<body>
  <main>
    <p class="brand">Sarveda</p>
    <h1>We'll be right back</h1>
    <p>We're finishing a short migration update. The shop will reopen shortly — thank you for your patience.</p>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": "3600"
    }
  });
}

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

  // Cutover / ops: temporary public maintenance (admin + /api stay open via matcher).
  if (isMaintenanceModeEnabled()) {
    if (!hasMaintenanceBypass(request)) {
      return maintenanceHtmlResponse();
    }
    const secret = maintenanceBypassSecret();
    if (secret && request.nextUrl.searchParams.get("maint_bypass") === secret) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete("maint_bypass");
      const redirect = NextResponse.redirect(clean);
      redirect.cookies.set({
        name: MAINT_BYPASS_COOKIE,
        value: secret,
        path: "/",
        maxAge: 60 * 60 * 12,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true
      });
      return redirect;
    }
  }

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

  // Historical Woo nested categories: /product-category/{parent}/{child}/ → 301 /product-category/{child}
  // Only audited pairs with verified native leaf slugs (see legacy-woo-category-url.ts).
  if (pathname.startsWith("/product-category/")) {
    const redirectPath = resolveNestedCategoryRedirect(pathname, searchParams);
    if (redirectPath) {
      const target = new URL(redirectPath, request.nextUrl.origin);
      const redirect = NextResponse.redirect(target, 301);
      ensurePricingZoneCookie(request, redirect);
      return redirect;
    }
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
