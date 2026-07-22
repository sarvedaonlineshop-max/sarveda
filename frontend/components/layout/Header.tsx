"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";
import { SearchWithSuggestions } from "@/components/search/SearchWithSuggestions";
import { isAdminRole, logoutSession } from "@/lib/auth-client";
import { MAIN_NAV_LINKS } from "@/lib/main-nav";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";

import { useStorefrontSession } from "./useStorefrontSession";

const immersiveMobileRoutes = new Set(["/cart", "/profile", "/chat"]);

/* ── Announcement bar messages ─────────────────────────────────── */
const ANNOUNCEMENTS = [
  "💳 Visa · Mastercard · PayPal · Stripe accepted",
  "Use WELCOME5 for 5% off your first order",
  "🌍 Shipping to India · US · UK · Worldwide",
  "🎵 Audio samples on all singing bowls"
];

function AnnouncementBar() {
  const items = [...ANNOUNCEMENTS, ...ANNOUNCEMENTS];
  return (
    <div className="overflow-hidden bg-brand-forest py-2 text-xs font-medium tracking-wide text-brand-gold-pale">
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
  const common = "h-[18px] w-[18px] shrink-0";
  switch (label) {
    case "Home":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
        </svg>
      );
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
    <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand-forest/15 bg-white text-brand-forest shadow-sm transition-all hover:border-brand-gold/50 hover:text-brand-gold">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-forest px-1 text-[10px] font-bold text-brand-cream">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </span>
  );
}

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { goToCart } = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const sessionUser = useStorefrontSession();

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

  async function handleSignOut() {
    await logoutSession();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className={`fixed inset-x-0 top-0 z-50 ${chromeVisibility}`}>
        <AnnouncementBar />

        <header className="border-b border-brand-forest/10 bg-white shadow-[0_8px_24px_rgba(16,32,26,0.06)]">
          {/* ── Layer 1: brand + primary nav ───────────────────────── */}
          <div className="border-b border-brand-cream-dark/70 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <SarvedaLogo
                showTagline
                iconHeight={36}
                wordmarkClassName="font-serif text-xl italic leading-tight tracking-wide text-brand-forest transition-colors group-hover:text-brand-gold md:text-2xl"
              />

              <nav
                className="ml-2 hidden flex-1 items-center justify-center gap-1 lg:gap-2 md:flex"
                aria-label="Main"
              >
                {MAIN_NAV_LINKS.map((link) => {
                  const active = isNavActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`group flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium tracking-wide transition-all ${
                        active
                          ? "bg-brand-forest/8 text-brand-forest"
                          : "text-brand-forest/80 hover:bg-brand-cream hover:text-brand-forest"
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

              <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
                <Link
                  href="/shop"
                  className="hidden min-h-[42px] items-center justify-center rounded-full bg-brand-forest px-5 text-xs font-bold uppercase tracking-[0.12em] text-brand-cream shadow-sm transition-colors hover:bg-brand-night md:inline-flex"
                >
                  Shop now
                </Link>

                <Link
                  href="/profile"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-forest/10 bg-brand-cream text-brand-forest transition-colors hover:border-brand-gold/40 hover:text-brand-gold md:hidden"
                  aria-label={displayName ? `You, ${displayName}` : "Account"}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
                    />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* ── Layer 2: search + account tools ────────────────────── */}
          <div className="hidden bg-brand-cream/90 md:block" style={{ backdropFilter: "blur(10px)" }}>
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-muted"
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
                  inputClassName="w-full rounded-full border border-brand-forest/12 bg-white py-2.5 pl-11 pr-4 text-sm text-brand-ink shadow-sm placeholder:text-brand-muted transition-all focus:border-brand-gold/50 focus:outline-none focus:ring-2 focus:ring-brand-gold/25"
                />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {sessionUser ? (
                  <>
                    <Link
                      href="/profile"
                      className="inline-flex max-w-[12rem] items-center gap-2 rounded-full border border-brand-forest/10 bg-white px-3.5 py-2 text-sm font-medium text-brand-forest shadow-sm transition-all hover:border-brand-gold/40 hover:text-brand-gold"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-forest/10 text-[11px] font-bold uppercase text-brand-forest">
                        {(displayName || "U").slice(0, 1)}
                      </span>
                      <span className="truncate">Hello, {displayName}</span>
                    </Link>
                    {isAdminRole(sessionUser.role) ? (
                      <Link
                        href="/admin"
                        className="inline-flex items-center rounded-full border border-brand-forest/10 bg-white px-3.5 py-2 text-sm font-medium text-brand-muted shadow-sm transition-all hover:border-brand-gold/40 hover:text-brand-gold"
                      >
                        Admin
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="inline-flex items-center rounded-full border border-brand-terra/20 bg-white px-3.5 py-2 text-sm font-semibold text-brand-terra shadow-sm transition-all hover:bg-brand-terra/5"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center rounded-full border border-brand-forest/10 bg-white px-4 py-2 text-sm font-medium text-brand-forest shadow-sm transition-all hover:border-brand-gold/40 hover:text-brand-gold"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="inline-flex items-center rounded-full bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-night shadow-sm transition-colors hover:bg-[#a37934]"
                    >
                      Sign up
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
            </div>
          </div>
        </header>
      </div>

      <div
        className={`shrink-0 ${chromeVisibility}`}
        style={{ height: "var(--storefront-header-offset)" }}
        aria-hidden="true"
      />
    </>
  );
}
