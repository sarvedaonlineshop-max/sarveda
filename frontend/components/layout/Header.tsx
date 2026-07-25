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
    <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-forest/15 bg-white text-brand-forest transition-all hover:border-brand-gold/50 hover:bg-brand-gold/10 hover:text-brand-gold">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold text-brand-night">
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

function TrackOrderButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        compact
          ? "inline-flex min-h-[36px] max-w-[9.5rem] items-center gap-1 rounded-full bg-brand-sage px-2.5 text-[11px] font-semibold leading-tight text-white shadow-sm transition-colors hover:bg-brand-forest"
          : "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full bg-brand-sage px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-forest"
      }
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6l6-2v10M5 16V8l6-2"
        />
      </svg>
      {compact ? "Track order" : "Track my order"}
    </button>
  );
}

function isShopListingPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/shop" || pathname.startsWith("/shop/") || pathname.startsWith("/product-category");
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
  const [, startTransition] = useTransition();

  const [marqueeHidden, setMarqueeHidden] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);

  const hideMarquee = isProfilePath(pathname);
  const isShopPage = isShopListingPath(pathname);
  const headerCompact = hideMarquee || marqueeHidden;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

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
    const root = document.documentElement;
    root.dataset.headerScrolled = headerCompact ? "true" : "false";
    root.dataset.headerNoMarquee = hideMarquee ? "true" : "false";
    return () => {
      delete root.dataset.headerScrolled;
      delete root.dataset.headerNoMarquee;
    };
  }, [headerCompact, hideMarquee]);

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
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
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
          {/* Layer 1: logo + nav + auth/cart */}
          <div className="border-b border-brand-cream-dark/60 bg-white">
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

              {/* Desktop: auth + cart */}
              <div className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
                {sessionUser ? (
                  <>
                    <Link
                      href="/profile"
                      onClick={(e) => {
                        e.preventDefault();
                        goNav("/profile");
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-brand-forest/12 bg-white text-brand-forest transition-all hover:border-brand-gold/45 hover:bg-brand-gold/10 hover:text-brand-gold"
                      aria-label={displayName ? `Account, ${displayName}` : "Profile"}
                      title={displayName ? `Hello, ${displayName}` : "Profile"}
                    >
                      <ProfileIcon />
                    </Link>
                  </>
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

              {/* Mobile: Track order (+ store category menu) — profile/cart live in bottom nav */}
              <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
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

          {/* Layer 2: search + track order (desktop). Hide global search on store — shop has its own. */}
          <div className="hidden bg-brand-cream/95 md:block">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
              {isShopPage ? (
                <div className="min-w-0 flex-1" aria-hidden />
              ) : (
                <div className="relative z-[60] min-w-0 flex-1">
                  <svg
                    className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted"
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
                  <SearchWithSuggestions
                    id="desktop-search"
                    placeholder="Search products, courses, insights…"
                    inputClassName="w-full rounded-full border border-brand-forest/12 bg-white py-1.5 pl-10 pr-3 text-sm text-brand-ink placeholder:text-brand-muted transition-all focus:border-brand-gold/50 focus:outline-none focus:ring-1 focus:ring-brand-gold/30"
                  />
                </div>
              )}

              <TrackOrderButton onClick={onTrackClick} />
            </div>
          </div>
        </header>
      </div>

      <div className={`shrink-0 ${chromeVisibility}`} style={{ height: spacerHeight }} aria-hidden="true" />

      <TrackOrderModal open={trackOpen} onClose={() => setTrackOpen(false)} />
    </>
  );
}
