"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { isAdminRole, logoutSession } from "@/lib/auth-client";

import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-amber-400 transition-colors hover:bg-stone-800 hover:text-amber-300">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-semibold text-stone-900">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}

const navLinkClass =
  "text-sm font-medium tracking-wide text-stone-300 transition-colors hover:text-amber-400";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { openDrawer } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser = useStorefrontSession();
  const [query, setQuery] = useState("");

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup")
  ) {
    return null;
  }

  const hideOnMobile = pathname ? immersiveMobileRoutes.has(pathname) : false;
  const displayName = sessionUser?.name?.trim() || sessionUser?.email?.split("@")[0];

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
    <header
      className={`sticky top-0 z-50 border-b border-stone-800 bg-stone-900/95 shadow-md backdrop-blur-md ${
        hideOnMobile ? "hidden md:block" : ""
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0 shrink-0">
          <span className="block font-serif text-xl italic leading-tight text-amber-400 md:text-2xl">
            ☸ Sarveda
          </span>
          <span className="mt-0.5 hidden text-xs font-normal tracking-wide text-stone-400 md:block">
            Yoga · Ayurveda · Sound
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <Link href="/" className={navLinkClass}>
            Home
          </Link>
          <Link href="/shop" className={navLinkClass}>
            Shop
          </Link>
          <Link href="/#courses" className={navLinkClass}>
            Courses
          </Link>
        </nav>

        <form
          onSubmit={handleSearch}
          className="hidden min-w-0 flex-1 items-center md:flex md:max-w-md lg:max-w-lg"
          role="search"
        >
          <label htmlFor="desktop-search" className="sr-only">
            Search products
          </label>
          <input
            id="desktop-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Sarveda…"
            className="w-full rounded-full border border-stone-700 bg-stone-950/70 px-4 py-2.5 text-sm text-stone-100 placeholder:text-stone-500 transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </form>

        <div className="flex shrink-0 items-center gap-1 md:gap-3">
          <Link href="/profile" className="inline-flex h-11 max-w-[8rem] items-center justify-center rounded-lg px-2 text-stone-300 transition-colors hover:bg-stone-800 hover:text-amber-400 md:hidden" aria-label={displayName ? `You, ${displayName}` : "You"}>
            <span className="truncate text-xs font-medium">{displayName ? `Hi, ${displayName}` : "You"}</span>
          </Link>

          <div className="hidden items-center gap-4 md:flex" aria-label="Account">
            {sessionUser ? (
              <>
                <Link href="/profile" className="max-w-[12rem] truncate text-sm font-medium text-stone-200 hover:text-amber-400">
                  Hello, {displayName}
                </Link>
                {isAdminRole(sessionUser.role) ? (
                  <Link href="/admin" className="text-sm font-medium text-stone-400 transition-colors hover:text-amber-400">
                    Admin
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="text-sm font-medium text-stone-400 transition-colors hover:text-amber-400"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-stone-400 transition-colors hover:text-amber-400">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:border-amber-400 hover:bg-amber-500/10"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openDrawer}
            className="hidden items-center rounded-lg md:flex"
            aria-label={`Open shopping cart, ${cartCount} items`}
          >
            <CartIcon count={cartCount} />
          </button>
        </div>
      </div>
    </header>
  );
}
