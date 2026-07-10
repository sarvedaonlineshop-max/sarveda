"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { SearchWithSuggestions } from "@/components/search/SearchWithSuggestions";
import { isAdminRole, logoutSession } from "@/lib/auth-client";
import { MAIN_NAV_LINKS } from "@/lib/main-nav";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";

import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

/* ── Announcement bar messages ─────────────────────────────────── */
const ANNOUNCEMENTS = [
  "Free shipping on orders above ₹999",
  "Use WELCOME10 for 10% off your first order",
  "Shipping to India · US · UK · Worldwide",
  "Audio samples on all singing bowls",
];

function AnnouncementBar() {
  // Duplicate for seamless marquee
  const items = [...ANNOUNCEMENTS, ...ANNOUNCEMENTS];
  return (
    <div className="overflow-hidden bg-brand-forest py-2 text-xs font-medium tracking-wide text-brand-gold-pale">
      <div
        className="flex whitespace-nowrap"
        style={{ animation: "marquee 32s linear infinite" }}
      >
        {items.map((msg, i) => (
          <span key={i} className="mx-8 shrink-0">
            {msg}
          </span>
        ))}
      </div>
    </div>
  );
}

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-brand-forest transition-colors hover:bg-brand-forest/5 hover:text-brand-gold">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
        <path strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-forest px-1 text-[10px] font-bold text-brand-cream">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

const navLinkClass =
  "relative text-sm font-medium tracking-wide text-brand-forest transition-colors hover:text-brand-gold after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-brand-gold after:transition-all hover:after:w-full";

export function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const { goToCart }             = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser              = useStorefrontSession();
  const [menuOpen, setMenuOpen]  = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup")
  ) return null;

  const hideOnMobile = pathname ? immersiveMobileRoutes.has(pathname) : false;
  const displayName  = sessionUser?.name?.trim() || sessionUser?.email?.split("@")[0];

  async function handleSignOut() {
    await logoutSession();
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
    <div className={hideOnMobile ? "hidden md:block" : ""}>
      {/* Announcement Bar */}
      <AnnouncementBar />

      {/* Main Header */}
      <header className="sticky top-0 z-50 border-b border-brand-forest/10 bg-brand-cream/95 shadow-sm"
        style={{ backdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">

          {/* Mobile menu */}
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-brand-forest transition-colors hover:bg-brand-forest/5 hover:text-brand-gold md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-label="Open menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo */}
          <SarvedaLogo
            showTagline
            iconHeight={34}
            wordmarkClassName="font-serif text-xl italic leading-tight tracking-wide text-brand-forest transition-colors group-hover:text-brand-gold md:text-2xl"
          />

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-6 lg:gap-8 md:flex" aria-label="Main">
            {MAIN_NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClass}>
                {link.label === "Corporate Wellness" ? (
                  <>
                    <span className="hidden lg:inline">Corporate Wellness</span>
                    <span className="lg:hidden">Corporate</span>
                  </>
                ) : (
                  link.label
                )}
              </Link>
            ))}
          </nav>

          {/* Search Bar — desktop */}
          <div className="relative hidden min-w-0 flex-1 md:block md:max-w-sm lg:max-w-md">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-muted"
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
              placeholder="Search Sarveda…"
              inputClassName="w-full rounded-full border border-brand-forest/15 bg-white/70 py-2.5 pl-10 pr-4 text-sm text-brand-ink placeholder:text-brand-muted transition-all focus:border-brand-gold/60 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
            />
          </div>

          {/* Right actions */}
          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">

            {/* Mobile: account shortcut */}
            <Link
              href="/profile"
              className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-brand-forest transition-colors hover:bg-brand-forest/5 hover:text-brand-gold md:hidden"
              aria-label={displayName ? `You, ${displayName}` : "Account"}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"/>
              </svg>
            </Link>

            {/* Desktop: account */}
            <div className="hidden items-center gap-3 md:flex">
              {sessionUser ? (
                <>
                  <Link href="/profile" className="max-w-[10rem] truncate text-sm font-medium text-brand-forest hover:text-brand-gold transition-colors">
                    Hello, {displayName}
                  </Link>
                  {isAdminRole(sessionUser.role) && (
                    <Link href="/admin" className="text-sm text-brand-muted hover:text-brand-gold transition-colors">
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="text-sm text-brand-muted hover:text-brand-gold transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium text-brand-forest hover:text-brand-gold transition-colors">
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full bg-brand-forest px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Cart */}
            <button
              type="button"
              onClick={goToCart}
              className="inline-flex items-center rounded-xl transition-colors"
              aria-label={`Open cart, ${cartCount} items`}
            >
              <CartIcon count={cartCount} />
            </button>
          </div>
        </div>
      </header>
    </div>

    {menuOpen ? (
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-brand-cream md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between border-b border-brand-forest/10 px-4 py-4">
          <div className="flex items-center gap-2">
            <Image src="/brand/sarveda-logo.png" alt="" width={18} height={36} className="object-contain" aria-hidden />
            <span className="font-serif text-xl italic text-brand-forest">Menu</span>
          </div>
          <button
            type="button"
            className="flex h-11 min-w-[44px] items-center justify-center rounded-xl text-brand-forest hover:text-brand-gold"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6" aria-label="Mobile main">
          <div className="mb-4 px-1">
            <SearchWithSuggestions
              id="mobile-search"
              placeholder="Search products…"
              inputClassName="w-full rounded-xl border border-brand-forest/15 bg-white/70 py-3 pl-4 pr-4 text-base text-brand-ink placeholder:text-brand-muted focus:border-brand-gold/60 focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
          {MAIN_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-brand-forest hover:bg-brand-forest/5 hover:text-brand-gold"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="my-2 h-px bg-brand-forest/10" />
          {sessionUser ? (
            <>
              <Link
                href="/profile"
                className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-brand-gold hover:bg-brand-forest/5"
                onClick={() => setMenuOpen(false)}
              >
                Hello, {displayName}
              </Link>
              {isAdminRole(sessionUser.role) ? (
                <Link
                  href="/admin"
                  className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-brand-gold hover:bg-brand-forest/5"
                  onClick={() => setMenuOpen(false)}
                >
                  Admin panel
                </Link>
              ) : null}
              <button
                type="button"
                className="min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-medium text-brand-muted hover:bg-brand-forest/5"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-brand-forest hover:bg-brand-forest/5 hover:text-brand-gold"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-semibold text-brand-gold hover:bg-brand-forest/5"
                onClick={() => setMenuOpen(false)}
              >
                Sign up
              </Link>
            </>
          )}
          <div className="my-2 h-px bg-brand-forest/10" />
          <button
            type="button"
            className="min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-semibold text-brand-forest hover:bg-brand-forest/5"
            onClick={() => {
              setMenuOpen(false);
              goToCart();
            }}
          >
            Cart {cartCount > 0 ? `(${cartCount})` : ""}
          </button>
        </nav>
      </div>
    ) : null}
    </>
  );
}
