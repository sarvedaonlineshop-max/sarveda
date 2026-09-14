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
  <title>Sarveda — maintenance</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background:
        radial-gradient(ellipse at 20% 10%, rgba(212, 175, 55, 0.18), transparent 45%),
        radial-gradient(ellipse at 80% 90%, rgba(26, 77, 54, 0.12), transparent 50%),
        linear-gradient(165deg, #fbf8f1 0%, #eef5ef 55%, #e4efe8 100%);
      color: #1f3d2f;
    }
    main {
      width: min(92vw, 28rem);
      padding: 2.25rem 1.75rem 2rem;
      text-align: center;
      background: rgba(255, 255, 255, 0.72);
      border: 1px solid rgba(31, 61, 47, 0.08);
      border-radius: 1.25rem;
      box-shadow: 0 18px 50px rgba(16, 32, 26, 0.08);
      backdrop-filter: blur(8px);
    }
    .logo {
      display: block;
      width: min(72vw, 240px);
      height: auto;
      margin: 0 auto 1.35rem;
    }
    .emoji-row {
      font-size: 1.55rem;
      letter-spacing: 0.35rem;
      margin: 0 0 1rem;
      line-height: 1;
    }
    p {
      font-size: 1.05rem;
      line-height: 1.65;
      margin: 0 0 0.85rem;
      color: #3a5548;
    }
    p:last-child { margin-bottom: 0; }
    .window {
      font-weight: 600;
      color: #1a4d36;
    }
  </style>
</head>
<body>
  <main>
    <img
      class="logo"
      src="/images/brand/sarveda-logo.svg"
      width="426"
      height="144"
      alt="Sarveda"
    />
    <p class="emoji-row" aria-hidden="true">🛠️ ⏳ 🙏</p>
    <p class="window">The website is under maintenance from 14 September, 7:00&nbsp;PM to 15 September, 6:00&nbsp;AM IST.</p>
    <p>Kindly bear with us. Thank you for your patience.</p>
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

  // Staging domain retired — permanent redirect to live apex (also in next.config).
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (host === "sarveda-demo.xyz" || host === "www.sarveda-demo.xyz") {
    const target = new URL(
      `${pathname}${request.nextUrl.search}`,
      "https://sarveda.com"
    );
    return NextResponse.redirect(target, 308);
  }

  // Cutover / ops: temporary public maintenance (admin + /api stay open via matcher).
  // /login stays open so staff can re-auth into /admin during the window.
  if (
    isMaintenanceModeEnabled() &&
    pathname !== "/login" &&
    !pathname.startsWith("/login/")
  ) {
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
