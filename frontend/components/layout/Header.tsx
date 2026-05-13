"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { isAdminRole, logoutSession } from "@/lib/auth-client";

import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

/* ── Announcement bar messages ─────────────────────────────────── */
const ANNOUNCEMENTS = [
  "🌿  Free shipping on orders above ₹999",
  "✨  Use WELCOME10 for 10% off your first order",
  "🌍  Shipping to India · US · UK · Worldwide",
  "🎵  Audio samples on all singing bowls",
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
    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-brand-gold transition-colors hover:bg-white/10 hover:text-brand-gold-pale">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
        <path strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-brand-night">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

const navLinkClass =
  "relative text-sm font-medium tracking-wide text-stone-300 transition-colors hover:text-brand-gold after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-brand-gold after:transition-all hover:after:w-full";

export function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const { openDrawer }           = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser              = useStorefrontSession();
  const [query, setQuery]        = useState("");

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup")
  ) return null;

  const hideOnMobile = pathname ? immersiveMobileRoutes.has(pathname) : false;
  const displayName  = sessionUser?.name?.trim() || sessionUser?.email?.split("@")[0];

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  async function handleSignOut() {
    await logoutSession();
    router.refresh();
  }

  return (
    <div className={hideOnMobile ? "hidden md:block" : ""}>
      {/* Announcement Bar */}
      <AnnouncementBar />

      {/* Main Header */}
      <header className="sticky top-0 z-50 border-b border-white/8 shadow-lg"
        style={{ background: "linear-gradient(180deg, #0f1a14 0%, #111d17 100%)", backdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">

          {/* Logo */}
          <Link href="/" className="shrink-0 group">
            <div className="flex flex-col">
              <span className="font-serif text-xl italic leading-tight tracking-wide text-brand-gold transition-colors group-hover:text-brand-gold-pale md:text-2xl">
                ☸ Sarveda
              </span>
              <span className="hidden text-[10px] font-normal tracking-[0.22em] text-brand-sage md:block">
                YOGA · AYURVEDA · SOUND
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            <Link href="/"        className={navLinkClass}>Home</Link>
            <Link href="/shop"    className={navLinkClass}>Shop</Link>
            <Link href="/#courses" className={navLinkClass}>Courses</Link>
          </nav>

          {/* Search Bar — desktop */}
          <form
            onSubmit={handleSearch}
            className="hidden min-w-0 flex-1 md:flex md:max-w-sm lg:max-w-md"
            role="search"
          >
            <label htmlFor="desktop-search" className="sr-only">Search products</label>
            <div className="relative w-full">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z"/>
              </svg>
              <input
                id="desktop-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Sarveda…"
                className="w-full rounded-full border border-white/10 bg-white/6 py-2.5 pl-10 pr-4 text-sm text-stone-100 placeholder:text-stone-500 transition-all focus:border-brand-gold/60 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">

            {/* Mobile: account shortcut */}
            <Link
              href="/profile"
              className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-stone-300 transition-colors hover:bg-white/8 hover:text-brand-gold md:hidden"
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
                  <Link href="/profile" className="max-w-[10rem] truncate text-sm font-medium text-stone-300 hover:text-brand-gold transition-colors">
                    Hello, {displayName}
                  </Link>
                  {isAdminRole(sessionUser.role) && (
                    <Link href="/admin" className="text-sm text-stone-400 hover:text-brand-gold transition-colors">
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="text-sm text-stone-400 hover:text-brand-gold transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="text-sm font-medium text-stone-300 hover:text-brand-gold transition-colors">
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="rounded-full border border-brand-gold/40 bg-brand-gold/8 px-4 py-2 text-sm font-semibold text-brand-gold transition-all hover:border-brand-gold hover:bg-brand-gold/15"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            {/* Cart */}
            <button
              type="button"
              onClick={openDrawer}
              className="inline-flex items-center rounded-xl transition-colors"
              aria-label={`Open cart, ${cartCount} items`}
            >
              <CartIcon count={cartCount} />
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}
