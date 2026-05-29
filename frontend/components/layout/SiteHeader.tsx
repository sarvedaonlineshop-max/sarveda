"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import type { PublicUser } from "@/lib/auth-client";
import { fetchMe, isAdminRole, logoutSession } from "@/lib/auth-client";
import { MAIN_NAV_LINKS } from "@/lib/main-nav";

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

function MenuIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
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
    "relative flex min-h-[44px] items-center px-2 py-2 text-[13px] font-normal tracking-[0.04em] transition-colors md:min-h-0";
  if (active) {
    return `${base} text-brand-lavender after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-violet`;
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

export function SiteHeader() {
  const pathname = usePathname();
  const { openDrawer } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
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

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
    return null;
  }

  const accountHref = sessionUser
    ? isAdminRole(sessionUser.role)
      ? "/admin"
      : "/my-account"
    : "/login";

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-50" style={headerStyle}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className={`${iconBtnClass} md:hidden`}
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-label="Open menu"
            >
              <MenuIcon />
            </button>
            <Link href="/" className="group min-w-0">
              <span className="display-text block text-xl italic leading-tight text-brand-lavender group-hover:text-brand-lavender md:text-2xl">
                Sarveda
              </span>
              <span className="mt-0.5 hidden text-[10px] font-normal tracking-[0.2em] text-[rgba(196,176,232,0.45)] md:block">
                YOGA · AYURVEDA · SOUND
              </span>
            </Link>
          </div>

          <nav className="hidden items-center gap-6 md:flex lg:gap-8" aria-label="Main">
            {MAIN_NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={navLinkClass(isNavActive(pathname, l.href))}>
                {l.label === "Corporate Wellness" ? (
                  <>
                    <span className="hidden lg:inline">Corporate Wellness</span>
                    <span className="lg:hidden">Corporate</span>
                  </>
                ) : (
                  l.label
                )}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Header actions">
            <Link href="/search" className={iconBtnClass} aria-label="Search">
              <SearchIcon />
            </Link>

            <CartIconButton count={cartCount} onClick={openDrawer} />

            <Link href={accountHref} className={iconBtnClass} aria-label={sessionUser ? "Account" : "Sign in"}>
              <UserIcon />
            </Link>

            <div className="hidden items-center gap-4 pl-2 lg:flex" aria-label="Account">
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
                    className="rounded-sm border px-4 py-2 text-[13px] font-medium tracking-[0.04em] text-brand-lavender transition-colors hover:bg-[rgba(196,176,232,0.08)]"
                    style={{ borderColor: "rgba(196,176,232,0.35)" }}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          style={{
            background: "rgba(22,8,58,0.97)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-4"
            style={{ borderColor: "rgba(196,176,232,0.12)" }}
          >
            <span className="display-text text-xl italic text-brand-lavender">Menu</span>
            <button
              type="button"
              className="flex h-11 min-w-[44px] items-center justify-center rounded-lg text-brand-lavender-mid transition hover:text-brand-lavender"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6" aria-label="Mobile main">
            {MAIN_NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="display-text min-h-[52px] rounded-xl px-4 py-3 text-lg font-normal text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <div className="my-2 h-px" style={{ background: "rgba(196,176,232,0.12)" }} />
            {isAdminRole(sessionUser?.role) ? (
              <Link
                href="/admin"
                className="display-text min-h-[52px] rounded-xl px-4 py-3 text-lg text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
                onClick={() => setMenuOpen(false)}
              >
                Admin panel
              </Link>
            ) : sessionUser ? (
              <Link
                href="/my-account"
                className="display-text min-h-[52px] rounded-xl px-4 py-3 text-lg text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
                onClick={() => setMenuOpen(false)}
              >
                My account
              </Link>
            ) : null}
            {sessionUser ? (
              <button
                type="button"
                className="min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-normal text-brand-lavender-mid hover:bg-[rgba(196,176,232,0.08)]"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="display-text min-h-[52px] rounded-xl px-4 py-3 text-lg text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="display-text min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign up
                </Link>
              </>
            )}
            <div className="my-2 h-px" style={{ background: "rgba(196,176,232,0.12)" }} />
            <button
              type="button"
              className="display-text min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-medium text-brand-lavender hover:bg-[rgba(196,176,232,0.08)]"
              onClick={() => {
                setMenuOpen(false);
                openDrawer();
              }}
            >
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
