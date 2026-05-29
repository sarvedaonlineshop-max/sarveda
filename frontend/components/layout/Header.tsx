"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { isAdminRole, logoutSession } from "@/lib/auth-client";

import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

const ANNOUNCEMENTS = [
  "🌿  Free shipping on orders above ₹999",
  "✨  Use WELCOME10 for 10% off your first order",
  "🌍  Shipping to India · US · UK · Worldwide",
  "🎵  Audio samples on all singing bowls",
];

const headerStyle = {
  background: "rgba(26,8,64,0.92)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderBottom: "2px solid rgba(91,62,155,0.45)",
  boxShadow: "0 8px 32px rgba(10,4,30,0.55), 0 1px 0 rgba(196,176,232,0.08)",
} as const;

const iconBtnClass =
  "inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-brand-lavender-mid transition hover:bg-[rgba(196,176,232,0.08)] hover:text-brand-lavender active:scale-[0.92]";

function AnnouncementText({ text }: { text: string }) {
  const parts = text.split(/(WELCOME10)/g);
  return (
    <>
      {parts.map((part, i) =>
        part === "WELCOME10" ? (
          <span key={i} className="font-bold text-[#E8C870]">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function AnnouncementBar() {
  const items = [...ANNOUNCEMENTS, ...ANNOUNCEMENTS];
  return (
    <div
      className="overflow-hidden py-2 font-medium"
      style={{
        background: "#0F0620",
        borderBottom: "1px solid rgba(91,62,155,0.3)",
        color: "#C8A460",
        fontSize: "11px",
        letterSpacing: "0.6px",
        fontWeight: 500,
      }}
    >
      <div className="flex whitespace-nowrap" style={{ animation: "marquee 32s linear infinite" }}>
        {items.map((msg, i) => (
          <span key={i} className="mx-8 shrink-0">
            <AnnouncementText text={msg} />
          </span>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
    </svg>
  );
}

function CartBagIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CartIconButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative ${iconBtnClass}`}
      aria-label={`Open cart, ${count} items`}
    >
      <CartBagIcon />
      {count > 0 && (
        <span
          className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
          style={{ background: "#5B3E9B" }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function navLinkClass(active: boolean) {
  const base =
    "relative text-[13px] font-normal tracking-[0.04em] transition-colors";
  if (active) {
    return `${base} text-brand-lavender after:absolute after:-bottom-1 after:left-0 after:right-0 after:h-0.5 after:bg-brand-violet`;
  }
  return `${base} text-[rgba(196,176,232,0.7)] hover:text-brand-lavender`;
}

const sessionLinkClass =
  "text-[13px] font-normal tracking-[0.04em] text-[rgba(196,176,232,0.7)] transition-colors hover:text-brand-lavender";

function isNavActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { openDrawer } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser = useStorefrontSession();
  const [query, setQuery] = useState("");

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
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
    <div className={hideOnMobile ? "hidden md:block" : ""}>
      <AnnouncementBar />

      <header className="sticky top-0 z-50" style={headerStyle}>
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="group shrink-0">
            <div className="flex flex-col">
              <span className="display-text text-xl italic leading-tight tracking-wide text-brand-lavender transition-colors group-hover:text-brand-lavender md:text-2xl">
                Sarveda
              </span>
              <span className="hidden text-[10px] font-normal tracking-[0.2em] text-[rgba(196,176,232,0.45)] md:block">
                YOGA · AYURVEDA · SOUND
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            <Link href="/" className={navLinkClass(isNavActive(pathname, "/"))}>
              Home
            </Link>
            <Link href="/shop" className={navLinkClass(isNavActive(pathname, "/shop"))}>
              Shop
            </Link>
            <Link href="/courses" className={navLinkClass(isNavActive(pathname, "/courses"))}>
              Courses
            </Link>
          </nav>

          <form
            onSubmit={handleSearch}
            className="hidden min-w-0 flex-1 md:flex md:max-w-sm lg:max-w-md"
            role="search"
          >
            <label htmlFor="desktop-search" className="sr-only">
              Search products
            </label>
            <div className="relative w-full">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-lavender-mid">
                <SearchIcon />
              </span>
              <input
                id="desktop-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Sarveda…"
                className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm text-brand-lavender transition-all placeholder:text-[rgba(196,176,232,0.45)] focus:outline-none focus:ring-1"
                style={{
                  background: "rgba(196,176,232,0.08)",
                  borderColor: "rgba(196,176,232,0.22)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#9B82CC";
                  e.currentTarget.style.boxShadow = "0 0 0 1px rgba(155,130,204,0.4)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(196,176,232,0.22)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
            <Link
              href="/search"
              className={`${iconBtnClass} md:hidden`}
              aria-label="Search"
            >
              <SearchIcon />
            </Link>

            <Link
              href="/profile"
              className={`${iconBtnClass} md:hidden`}
              aria-label={displayName ? `You, ${displayName}` : "Account"}
            >
              <UserIcon />
            </Link>

            <div className="hidden items-center gap-3 md:flex">
              {sessionUser ? (
                <>
                  <Link href="/profile" className={`max-w-[10rem] truncate ${sessionLinkClass}`}>
                    Hello, {displayName}
                  </Link>
                  {isAdminRole(sessionUser.role) && (
                    <Link href="/admin" className={sessionLinkClass}>
                      Admin
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
                    className="rounded-sm border px-4 py-2 text-[13px] font-medium tracking-[0.04em] text-brand-lavender transition-colors hover:bg-[rgba(196,176,232,0.08)]"
                    style={{ borderColor: "rgba(196,176,232,0.35)" }}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>

            <CartIconButton count={cartCount} onClick={openDrawer} />
          </div>
        </div>
      </header>
    </div>
  );
}
