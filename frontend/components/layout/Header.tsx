"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { SearchWithSuggestions } from "@/components/search/SearchWithSuggestions";
import { OPEN_SHOP_MENU_EVENT } from "@/components/shop/ShopMobileCategoryDrawer";
import { isMainNavActive, MAIN_NAV_LINKS } from "@/lib/main-nav";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";

import { TrackOrderModal } from "./TrackOrderModal";
import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

const ANNOUNCEMENTS = [
  "💳 Visa · Mastercard · PayPal · Stripe accepted",
  "Use WELCOME5 for 5% off your first order",
  "🌍 Shipping to India · US · UK · Worldwide",
  "🎵 Audio samples on all singing bowls"
];

function AnnouncementBar({ hidden }: { hidden: boolean }) {
  const items = [...ANNOUNCEMENTS, ...ANNOUNCEMENTS];
  return (
    <div
      className={`overflow-hidden bg-brand-forest text-xs font-medium tracking-wide text-brand-gold-pale transition-[max-height,opacity,padding] duration-300 ease-out ${
        hidden ? "max-h-0 py-0 opacity-0" : "max-h-10 py-2 opacity-100"
      }`}
      aria-hidden={hidden}
    >
      <div className="flex whitespace-nowrap" style={{ animation: "marquee 32s linear infinite" }}>
        {items.map((msg, i) => (
          <span key={i} className="mx-8 shrink-0">
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
}

function NavIcon({ label }: { label: string }) {
  const common = "h-[17px] w-[17px] shrink-0";
  switch (label) {
    case "Home":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
        </svg>
      );
    case "Store":
    case "Shop":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M3 9.5 5 4h14l2 5.5M3 9.5h18M3 9.5l2 11h14l2-11M9 13.5v5M15 13.5v5" />
        </svg>
      );
    case "Courses":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      );
    case "Events":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
        </svg>
      );
    case "Corporate Wellness":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" />
        </svg>
      );
    case "Insights":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 00-4 12.7V18h8v-2.3A7 7 0 0012 3zM10 21h4" />
        </svg>
      );
    default:
      return null;
  }
}

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-orange-500/40 bg-orange-50 text-orange-600 transition-all hover:border-orange-500 hover:bg-orange-100 hover:text-orange-700">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-600 px-1 text-[9px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}

function ProfileIcon() {
  return (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z"
      />
    </svg>
  );
}

function TrackOrderButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "inline-flex min-h-[36px] max-w-[9.5rem] items-center gap-1 rounded-full bg-red-600 px-2.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800"
          : "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-700 active:bg-red-800"
      }
    >
      {/* Package / parcel — reads clearly as order tracking */}
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16V8z"
        />
        <path strokeWidth={1.85} strokeLinecap="round" strokeLinejoin="round" d="M3.3 7L12 12l8.7-5M12 22V12" />
      </svg>
      {compact ? "Track order" : "Track my order"}
    </button>
  );
}

function PageLoadingSpinner() {
  return (
    <span
      className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-brand-gold/25 border-t-brand-gold"
      aria-hidden
    />
  );
}

function isShopListingPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/shop" || pathname.startsWith("/shop/") || pathname.startsWith("/product-category");
}

function isProductPdpPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/product/");
}

function isProfilePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/profile" || pathname.startsWith("/profile/") || pathname === "/my-account";
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { goToCart } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser = useStorefrontSession();
  const [isPending, startTransition] = useTransition();

  const [marqueeHidden, setMarqueeHidden] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const hideMarquee = isProfilePath(pathname);
  const isShopPage = isShopListingPath(pathname);
  const isProductPdp = isProductPdpPath(pathname);
  const headerCompact = hideMarquee || marqueeHidden;
  /** Shop listing uses ShopProductToolbar search; PDP keeps header layer-2 search always visible. */
  const showSearchToggle = !isShopPage && !isProductPdp;
  const showPersistentStoreSearch = isProductPdp;
  const showHeaderSearchLayer = showSearchToggle || showPersistentStoreSearch;
  const searchLayerExpanded = showPersistentStoreSearch || searchOpen;
  const isNavLoading = pendingHref != null || isPending;

  useEffect(() => {
    setPendingHref(null);
    setSearchOpen(false);
  }, [pathname]);

  // Safety: clear stuck pending if navigation never settles.
  useEffect(() => {
    if (!pendingHref) return;
    const t = window.setTimeout(() => setPendingHref(null), 12_000);
    return () => window.clearTimeout(t);
  }, [pendingHref]);

  useEffect(() => {
    if (hideMarquee) {
      setMarqueeHidden(true);
      return;
    }
    const onScroll = () => setMarqueeHidden(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideMarquee]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.headerScrolled = headerCompact ? "true" : "false";
    root.dataset.headerNoMarquee = hideMarquee ? "true" : "false";
    root.dataset.headerSearchOpen = searchLayerExpanded && showHeaderSearchLayer ? "true" : "false";
    root.dataset.headerPersistentSearch = showPersistentStoreSearch ? "true" : "false";
    return () => {
      delete root.dataset.headerScrolled;
      delete root.dataset.headerNoMarquee;
      delete root.dataset.headerSearchOpen;
      delete root.dataset.headerPersistentSearch;
    };
  }, [headerCompact, hideMarquee, searchLayerExpanded, showHeaderSearchLayer, showPersistentStoreSearch]);

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup")
  ) {
    return null;
  }

  const hideOnMobile = pathname ? immersiveMobileRoutes.has(pathname) : false;
  const displayName = sessionUser?.name?.trim() || sessionUser?.email?.split("@")[0];
  const chromeVisibility = hideOnMobile ? "hidden md:block" : "";

  function goNav(href: string) {
    if (isMainNavActive(pathname, href)) return;
    // Paint selected state first, then navigate.
    setPendingHref(href);
    // Shop browse uses a Suspense-heavy layout — startTransition soft-nav can leave
    // /shop blank. Push outside a transition so the RSC tree commits normally.
    if (isShopListingPath(href)) {
      router.push(href);
      return;
    }
    requestAnimationFrame(() => {
      startTransition(() => {
        router.push(href);
      });
    });
  }

  function onTrackClick() {
    if (sessionUser) {
      setPendingHref("/profile");
      startTransition(() => {
        router.push("/profile?tab=orders");
      });
      return;
    }
    setTrackOpen(true);
  }

  function openShopMenu() {
    window.dispatchEvent(new Event(OPEN_SHOP_MENU_EVENT));
  }

  const spacerHeight = headerCompact
    ? "var(--storefront-header-offset-scrolled)"
    : "var(--storefront-header-offset)";

  return (
    <>
      <div className={`fixed inset-x-0 top-0 z-50 ${chromeVisibility}`}>
        {hideMarquee ? null : <AnnouncementBar hidden={marqueeHidden} />}

        <header className="border-b border-brand-forest/10 bg-white shadow-[0_4px_16px_rgba(16,32,26,0.05)]">
          {/* Search first so it sits above the nav (taller bar on PDP). */}
          {showHeaderSearchLayer ? (
            <div
              id="header-search-panel"
              className={`border-b border-brand-cream-dark/60 bg-brand-cream/95 ${
                showPersistentStoreSearch
                  ? "max-h-[min(70vh,28rem)] overflow-visible opacity-100"
                  : `transition-[max-height,opacity] duration-300 ease-out ${
                      searchLayerExpanded
                        ? "max-h-[min(70vh,28rem)] overflow-visible opacity-100"
                        : "max-h-0 overflow-hidden opacity-0"
                    }`
              }`}
              aria-hidden={!searchLayerExpanded}
            >
              <div className="mx-auto flex max-w-7xl items-start gap-2.5 px-4 py-2.5 sm:gap-3 sm:px-6 lg:px-8">
                <div className="relative z-[60] min-w-0 flex-1">
                  <svg
                    className="pointer-events-none absolute left-4 top-[22px] z-10 h-4 w-4 text-brand-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z"
                    />
                  </svg>
                  {searchLayerExpanded ? (
                    <SearchWithSuggestions
                      id={showPersistentStoreSearch ? "pdp-store-search" : "desktop-search"}
                      autoFocus={showSearchToggle && searchOpen}
                      placeholder={
                        showPersistentStoreSearch
                          ? "Search products…"
                          : "Search products, courses, insights…"
                      }
                      inputClassName="w-full min-h-[44px] rounded-full border border-brand-forest/12 bg-white py-2.5 pl-11 pr-4 text-sm text-brand-ink placeholder:text-brand-muted transition-all focus:border-brand-gold/50 focus:outline-none focus:ring-1 focus:ring-brand-gold/30"
                      onNavigate={() => {
                        if (!showPersistentStoreSearch) setSearchOpen(false);
                      }}
                    />
                  ) : null}
                </div>
                {showSearchToggle ? (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(false)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-forest/10 text-brand-forest transition-colors hover:bg-brand-forest hover:text-brand-cream active:bg-brand-night active:text-brand-cream"
                    aria-label="Close search"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden>
                      <path strokeWidth={2.25} strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Logo + nav + track / search toggle / auth / cart */}
          <div className="bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
              <SarvedaLogo iconHeight={42} />

              <nav
                className="ml-1 hidden flex-1 items-center justify-center gap-0.5 lg:gap-1 md:flex"
                aria-label="Main"
              >
                {MAIN_NAV_LINKS.map((link) => {
                  const routeActive = isMainNavActive(pathname, link.href);
                  const pendingActive = pendingHref != null && isMainNavActive(pendingHref, link.href);
                  const active = pendingHref != null ? pendingActive : routeActive;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        goNav(link.href);
                      }}
                      className={`group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold tracking-wide transition-colors ${
                        active
                          ? "bg-brand-gold/20 text-brand-forest ring-1 ring-brand-gold/45"
                          : "text-brand-forest/75 hover:bg-brand-cream hover:text-brand-forest"
                      }`}
                    >
                      <span
                        className={`transition-colors ${
                          active ? "text-brand-gold" : "text-brand-sage group-hover:text-brand-gold"
                        }`}
                      >
                        <NavIcon label={link.label} />
                      </span>
                      <span className="whitespace-nowrap">
                        {link.label === "Corporate Wellness" ? (
                          <>
                            <span className="hidden xl:inline">Corporate Wellness</span>
                            <span className="xl:hidden">Corporate</span>
                          </>
                        ) : (
                          link.label
                        )}
                      </span>
                    </Link>
                  );
                })}
              </nav>

              {/* Desktop: track + search + auth + cart */}
              <div className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
                <TrackOrderButton onClick={onTrackClick} />

                {showSearchToggle ? (
                  <button
                    type="button"
                    onClick={() => setSearchOpen((v) => !v)}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                      searchOpen
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-blue-500/40 bg-blue-50 text-blue-600 hover:border-blue-600 hover:bg-blue-100 hover:text-blue-700"
                    }`}
                    aria-label={searchOpen ? "Close search" : "Open search"}
                    aria-expanded={searchOpen}
                    aria-controls="header-search-panel"
                  >
                    <SearchIcon />
                  </button>
                ) : null}

                {sessionUser ? (
                  <Link
                    href="/profile"
                    onClick={(e) => {
                      e.preventDefault();
                      goNav("/profile");
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-green-600/40 bg-green-50 text-green-700 transition-all hover:border-green-700 hover:bg-green-100 hover:text-green-800"
                    aria-label={displayName ? `Account, ${displayName}` : "Profile"}
                    title={displayName ? `Hello, ${displayName}` : "Profile"}
                  >
                    <ProfileIcon />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex min-h-[36px] items-center rounded-full border border-brand-forest/20 bg-white px-3.5 text-xs font-semibold text-brand-forest transition-all hover:border-brand-gold/50 hover:bg-brand-gold/10"
                    >
                      Login
                    </Link>
                    <Link
                      href="/signup"
                      className="inline-flex min-h-[36px] items-center rounded-full bg-brand-gold px-3.5 text-xs font-semibold text-brand-night shadow-sm transition-colors hover:bg-[#a37934]"
                    >
                      Register
                    </Link>
                  </>
                )}

                <button
                  type="button"
                  onClick={goToCart}
                  className="inline-flex items-center"
                  aria-label={`Open cart, ${cartCount} items`}
                >
                  <CartIcon count={cartCount} />
                </button>
              </div>

              {/* Mobile: search + track (+ store category menu) — profile/cart live in bottom nav */}
              <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
                {showSearchToggle ? (
                  <button
                    type="button"
                    onClick={() => setSearchOpen((v) => !v)}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                      searchOpen
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-blue-500/40 bg-blue-50 text-blue-600 hover:border-blue-600 hover:bg-blue-100"
                    }`}
                    aria-label={searchOpen ? "Close search" : "Open search"}
                    aria-expanded={searchOpen}
                    aria-controls="header-search-panel"
                  >
                    <SearchIcon />
                  </button>
                ) : null}
                <TrackOrderButton onClick={onTrackClick} compact />
                {isShopPage ? (
                  <button
                    type="button"
                    onClick={openShopMenu}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-forest/12 bg-white text-brand-forest transition-all hover:border-brand-gold/45 hover:bg-brand-gold/10"
                    aria-label="Open store categories"
                  >
                    <svg className="h-5 w-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeWidth={2} d="M3 4h18M3 12h18M3 20h18" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>
      </div>

      {isNavLoading ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-brand-cream/55 backdrop-blur-[1px]"
          style={{ paddingTop: spacerHeight }}
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading page"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand-forest/10 bg-white px-8 py-7 shadow-xl">
            <PageLoadingSpinner />
            <span className="text-sm font-semibold text-brand-forest">Loading…</span>
          </div>
        </div>
      ) : null}

      <div className={`shrink-0 ${chromeVisibility}`} style={{ height: spacerHeight }} aria-hidden="true" />

      <TrackOrderModal open={trackOpen} onClose={() => setTrackOpen(false)} />
    </>
  );
}
