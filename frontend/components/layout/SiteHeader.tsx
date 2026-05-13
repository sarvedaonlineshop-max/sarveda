"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import type { PublicUser } from "@/lib/auth-client";
import { fetchMe, isAdminRole, logoutSession } from "@/lib/auth-client";

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-amber-400 transition-colors hover:bg-stone-800 hover:text-amber-300 md:h-10 md:w-10">
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
  "min-h-[44px] px-2 py-2 text-sm font-medium tracking-wide text-stone-300 transition-colors hover:text-amber-400 md:min-h-0";

const sessionLinkClass =
  "text-sm font-medium tracking-wide text-stone-400 transition-colors hover:text-amber-400";

export function SiteHeader() {
  const pathname = usePathname();
  const { openDrawer } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (
      !pathname ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup")
    ) {
      setSessionUser(null);
      return;
    }
    let cancelled = false;
    void fetchMe().then((u) => {
      if (!cancelled) setSessionUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleSignOut() {
    await logoutSession();
    setSessionUser(null);
    setMenuOpen(false);
  }

  if (
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup")
  ) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stone-800 bg-stone-900 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-amber-400 md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-label="Open menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/" className="min-w-0">
              <span className="block font-serif text-2xl italic leading-tight text-amber-400">☸ Sarveda</span>
              <span className="mt-0.5 block text-xs font-normal tracking-wide text-stone-400">
                Yoga · Ayurveda · Sound
              </span>
            </Link>
          </div>

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

          <div className="hidden shrink-0 items-center gap-4 md:flex" aria-label="Account">
            {sessionUser ? (
              <>
                {isAdminRole(sessionUser.role) ? (
                  <Link href="/admin" className={sessionLinkClass}>
                    Admin panel
                  </Link>
                ) : (
                  <Link href="/my-account" className={sessionLinkClass}>
                    My account
                  </Link>
                )}
                <button type="button" onClick={() => void handleSignOut()} className={sessionLinkClass}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={sessionLinkClass}>
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
            className="flex flex-shrink-0 items-center rounded-lg"
            aria-label={`Open shopping cart, ${cartCount} items`}
          >
            <CartIcon count={cartCount} />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-stone-900 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="flex items-center justify-between border-b border-stone-800 px-4 py-4">
            <span className="font-serif text-xl italic text-amber-400">☸ Menu</span>
            <button
              type="button"
              className="flex h-11 min-w-[44px] items-center justify-center rounded-lg text-stone-300 hover:text-amber-400"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6" aria-label="Mobile main">
            <Link
              href="/"
              className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-stone-200 hover:bg-stone-800 hover:text-amber-400"
              onClick={() => setMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/shop"
              className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-stone-200 hover:bg-stone-800 hover:text-amber-400"
              onClick={() => setMenuOpen(false)}
            >
              Shop
            </Link>
            <Link
              href="/#courses"
              className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-stone-200 hover:bg-stone-800 hover:text-amber-400"
              onClick={() => setMenuOpen(false)}
            >
              Courses
            </Link>
            {isAdminRole(sessionUser?.role) ? (
              <Link
                href="/admin"
                className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-amber-400 hover:bg-stone-800"
                onClick={() => setMenuOpen(false)}
              >
                Admin panel
              </Link>
            ) : sessionUser ? (
              <Link
                href="/my-account"
                className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-amber-400 hover:bg-stone-800"
                onClick={() => setMenuOpen(false)}
              >
                My account
              </Link>
            ) : null}
            {sessionUser ? (
              <button
                type="button"
                className="min-h-[48px] w-full rounded-lg px-3 py-3 text-left text-lg font-medium tracking-wide text-stone-400 hover:bg-stone-800"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-stone-400 hover:bg-stone-800 hover:text-amber-400"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="min-h-[48px] rounded-lg px-3 py-3 text-lg font-medium tracking-wide text-amber-400 hover:bg-stone-800"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign up
                </Link>
              </>
            )}
            <button
              type="button"
              className="min-h-[48px] w-full rounded-lg px-3 py-3 text-left text-lg font-medium tracking-wide text-amber-400 hover:bg-stone-800"
              onClick={() => {
                setMenuOpen(false);
                openDrawer();
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
