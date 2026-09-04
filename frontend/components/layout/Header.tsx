"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { isAdminRole } from "@/lib/auth-client";
import { isMainNavActive, MAIN_NAV_LINKS } from "@/lib/main-nav";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";

import { TrackOrderModal, OPEN_TRACK_ORDER_EVENT } from "./TrackOrderModal";
import { CLOSE_MOBILE_MENU_EVENT, OPEN_MOBILE_MENU_EVENT } from "./mobile-menu-events";
import { dispatchNavStart } from "./RouteLoadingSpinner";
import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/chat"]);

import { AnnouncementBar } from "./AnnouncementBar";

const headerIconBtnPlain =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-forest transition-colors hover:bg-brand-cream sm:h-10 sm:w-10";

const HOME_GREEN = "#166D46";

function CartIcon({ count }: { count: number }) {
  return (
    <span className={headerIconBtnPlain}>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:h-5 sm:w-5" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-[#c9a227] px-1 text-[9px] font-bold leading-none text-[#1c352a] ring-[1.5px] ring-white"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}

function ProfileIcon({ className = "h-[18px] w-[18px] sm:h-5 sm:w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
      />
    </svg>
  );
}

function AdminIcon({ className = "h-[18px] w-[18px] sm:h-5 sm:w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7.5A1.5 1.5 0 014.5 6h15A1.5 1.5 0 0121 7.5v3A1.5 1.5 0 0119.5 12H4.5A1.5 1.5 0 013 10.5v-3zM4.5 12v6.75A1.5 1.5 0 006 20.25h3.75V12M13.5 12v8.25H18a1.5 1.5 0 001.5-1.5V12"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      {open ? (
        <path strokeLinecap="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path strokeLinecap="round" strokeWidth={2.2} d="M4 7h16M4 12h16M4 17h16" />
      )}
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
          ? "inline-flex min-h-[36px] max-w-[9.5rem] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold leading-tight text-white shadow-[0_4px_12px_rgba(22,109,70,0.28)] transition-colors hover:brightness-95 active:brightness-90"
          : "inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(22,109,70,0.28)] transition-all hover:-translate-y-0.5 hover:brightness-95 active:brightness-90 sm:px-5 sm:text-[13px]"
      }
      style={{ backgroundColor: HOME_GREEN }}
    >
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

function WelcomeUserChip({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <span
      className="inline-flex max-w-[12rem] items-center gap-1.5 text-[#166D46]"
      aria-label={`Welcome ${first}`}
    >
      <ProfileIcon className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 truncate text-[12px] font-semibold leading-tight">
        Welcome, {first}
      </span>
    </span>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const chromeRef = useRef<HTMLDivElement>(null);

  const hideMarquee = isProfilePath(pathname);
  const isHomePage = pathname === "/";
  const headerCompact = hideMarquee || marqueeHidden;

  useEffect(() => {
    setPendingHref(null);
    setMenuOpen(false);
  }, [pathname]);

  // Hard reload often restores mid-page scroll, which clips the announcement + hero top.
  // Keep Home pinned to the top on entry; shop scroll-restore stays untouched.
  useLayoutEffect(() => {
    if (!isHomePage) return;
    const prev = history.scrollRestoration;
    try {
      history.scrollRestoration = "manual";
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setMarqueeHidden(false);
    return () => {
      try {
        history.scrollRestoration = prev || "auto";
      } catch {
        /* ignore */
      }
    };
  }, [isHomePage]);

  // Safety: clear stuck pending if navigation never settles.
  useEffect(() => {
    if (!pendingHref) return;
    const t = window.setTimeout(() => setPendingHref(null), 3_000);
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
  }, [hideMarquee, isHomePage]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.headerScrolled = headerCompact ? "true" : "false";
    root.dataset.headerNoMarquee = hideMarquee ? "true" : "false";
    return () => {
      delete root.dataset.headerScrolled;
      delete root.dataset.headerNoMarquee;
    };
  }, [headerCompact, hideMarquee]);

  useLayoutEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const sync = () => {
      const height = Math.round(el.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty("--storefront-header-live-offset", `${height}px`);
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--storefront-header-live-offset");
    };
  }, []);

  const isAdminSession = isAdminRole(sessionUser?.role);
  const accountHome = "/profile";
  const accountOrdersHref = "/profile?tab=orders";

  useEffect(() => {
    const onOpenTrack = () => {
      if (sessionUser) {
        setPendingHref(accountOrdersHref);
        startTransition(() => {
          router.push(accountOrdersHref);
        });
        return;
      }
      setTrackOpen(true);
    };
    const onCloseMobileMenu = () => setMenuOpen(false);
    window.addEventListener(OPEN_TRACK_ORDER_EVENT, onOpenTrack);
    window.addEventListener(CLOSE_MOBILE_MENU_EVENT, onCloseMobileMenu);
    return () => {
      window.removeEventListener(OPEN_TRACK_ORDER_EVENT, onOpenTrack);
      window.removeEventListener(CLOSE_MOBILE_MENU_EVENT, onCloseMobileMenu);
    };
  }, [sessionUser, router, accountOrdersHref]);

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
    setPendingHref(href);
    dispatchNavStart();
    // Shop browse uses a Suspense-heavy layout — push outside a transition so the RSC tree commits.
    if (isShopListingPath(href)) {
      router.push(href);
      return;
    }
    startTransition(() => {
      router.push(href);
    });
  }

  function onTrackClick() {
    if (sessionUser) {
      setPendingHref(accountOrdersHref);
      startTransition(() => {
        router.push(accountOrdersHref);
      });
      return;
    }
    setTrackOpen(true);
  }

  const spacerHeight = "var(--storefront-header-live-offset)";

  return (
    <>
      <div ref={chromeRef} className={`fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top,0px)] ${chromeVisibility}`}>
        {hideMarquee || marqueeHidden ? null : <AnnouncementBar />}

        <header
          className={`overflow-visible bg-white ${
            isHomePage
              ? "border-b-0 shadow-none md:border-b md:border-brand-forest/10 md:shadow-[0_4px_16px_rgba(16,32,26,0.05)]"
              : "border-b border-brand-forest/10 shadow-[0_4px_16px_rgba(16,32,26,0.05)]"
          }`}
        >
          {/* Logo + nav + track / auth / cart */}
          <div className="overflow-visible bg-white">
            <div className="page-shell flex items-center gap-2 overflow-visible py-3.5 sm:gap-3 sm:py-4 md:py-5">
              <SarvedaLogo iconHeight={68} responsive />

              <nav
                className="ml-1 hidden min-w-0 flex-1 items-center justify-center gap-0.5 xl:flex 2xl:gap-1"
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
                      className={`group relative flex items-center px-1.5 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors 2xl:px-2.5 2xl:text-[15px] ${
                        active
                          ? "text-brand-gold"
                          : "text-brand-forest hover:text-brand-gold"
                      }`}
                    >
                      <span className="whitespace-nowrap">
                        {link.label === "Corporate Wellness" ? (
                          <>
                            <span className="hidden 2xl:inline">Corporate Wellness</span>
                            <span className="2xl:hidden">Corporate</span>
                          </>
                        ) : (
                          link.label
                        )}
                      </span>
                      <span
                        className={`absolute inset-x-2 -bottom-0.5 h-[3px] rounded-full bg-brand-gold transition-opacity ${
                          active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}
                        aria-hidden
                      />
                    </Link>
                  );
                })}
              </nav>

              {/* Desktop / tablet: track + auth + cart */}
              <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex lg:gap-4">
                <TrackOrderButton onClick={onTrackClick} />

                <div className="flex items-center gap-2.5 lg:gap-3">
                  {sessionUser ? (
                    <>
                      <Link
                        href={accountHome}
                        onClick={(e) => {
                          e.preventDefault();
                          goNav(accountHome);
                        }}
                        className={headerIconBtnPlain}
                        aria-label={displayName ? `Account, ${displayName}` : "Profile"}
                        title={displayName ? `Hello, ${displayName}` : "Profile"}
                      >
                        <ProfileIcon />
                      </Link>
                      {isAdminSession ? (
                        <Link
                          href="/admin"
                          onClick={(e) => {
                            e.preventDefault();
                            goNav("/admin");
                          }}
                          className={headerIconBtnPlain}
                          aria-label="Admin panel"
                          title="Admin panel"
                        >
                          <AdminIcon />
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <Link
                      href="/login"
                      className="inline-flex min-h-[40px] items-center rounded-full border border-brand-forest/20 bg-white px-3.5 text-xs font-semibold text-brand-forest transition-colors hover:bg-brand-cream sm:px-4"
                    >
                      Login/Register
                    </Link>
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

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen((v) => {
                      const next = !v;
                      // On mobile widths the green sheet is driven by BottomNav events.
                      if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
                        window.dispatchEvent(
                          new Event(next ? OPEN_MOBILE_MENU_EVENT : CLOSE_MOBILE_MENU_EVENT)
                        );
                      }
                      return next;
                    });
                  }}
                  className={`${headerIconBtnPlain} xl:hidden`}
                  aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                  aria-expanded={menuOpen}
                >
                  <MenuIcon open={menuOpen} />
                </button>
              </div>

              {/* Mobile: welcome label + green menu */}
              <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
                {displayName ? (
                  <WelcomeUserChip name={displayName} />
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex h-9 w-9 items-center justify-center text-[#166D46]"
                    aria-label="Sign in"
                  >
                    <ProfileIcon />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen((v) => {
                      const next = !v;
                      window.dispatchEvent(
                        new Event(next ? OPEN_MOBILE_MENU_EVENT : CLOSE_MOBILE_MENU_EVENT)
                      );
                      return next;
                    });
                  }}
                  className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#166D46] text-white shadow-[0_4px_12px_rgba(22,109,70,0.28)] transition-colors hover:brightness-95 active:brightness-90"
                  aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                  aria-expanded={menuOpen}
                >
                  <MenuIcon open={menuOpen} />
                </button>
              </div>
            </div>

            {menuOpen ? (
              <nav className="hidden border-t border-brand-cream-dark/70 bg-white md:block xl:hidden" aria-label="More">
                <div className="page-shell grid grid-cols-2 gap-1 py-3 sm:grid-cols-3 md:grid-cols-4">
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
                          setMenuOpen(false);
                          goNav(link.href);
                        }}
                        className={`flex items-center rounded-xl px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors ${
                          active
                            ? "bg-brand-gold/12 text-brand-gold"
                            : "text-brand-forest hover:bg-brand-cream hover:text-brand-gold"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </nav>
            ) : null}
          </div>
        </header>
      </div>

      <div className={`shrink-0 ${chromeVisibility}`} style={{ height: spacerHeight }} aria-hidden="true" />

      <TrackOrderModal open={trackOpen} onClose={() => setTrackOpen(false)} />
    </>
  );
}
