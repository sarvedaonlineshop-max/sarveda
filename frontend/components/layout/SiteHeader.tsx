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

function AnnouncementBar() {
  const items = [...ANNOUNCEMENTS, ...ANNOUNCEMENTS];
  return (
    <div className="overflow-hidden py-2 text-xs font-medium tracking-wide" style={{ background:"#1e3a2f", color:"#f5d88a" }}>
      <div className="flex whitespace-nowrap" style={{ animation:"marquee 32s linear infinite" }}>
        {items.map((msg, i) => (
          <span key={i} className="mx-8 shrink-0">{msg}</span>
        ))}
      </div>
    </div>
  );
}

function CartIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-white/10 md:h-10 md:w-10" style={{ color:"#e8b012" }}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
        <path strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.25 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.75 0 01.75 0z"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-bold" style={{ background:"#e8b012", color:"#0f1a14" }}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

const navLinkClass = "relative min-h-[44px] flex items-center px-2 py-2 text-sm font-medium tracking-wide text-stone-300 transition-colors hover:text-amber-400 md:min-h-0";
const sessionLinkClass = "text-sm font-medium tracking-wide text-stone-400 transition-colors hover:text-amber-400";

export function SiteHeader() {
  const pathname = usePathname();
  const { openDrawer }           = useCartUi();
  const { itemCount: cartCount } = useCartData();
  const [menuOpen, setMenuOpen]  = useState(false);
  const [sessionUser, setSessionUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
      setSessionUser(null);
      return;
    }
    let cancelled = false;
    void fetchMe().then((u) => { if (!cancelled) setSessionUser(u); });
    return () => { cancelled = true; };
  }, [pathname]);

  async function handleSignOut() {
    await logoutSession();
    setSessionUser(null);
    setMenuOpen(false);
  }

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login") || pathname?.startsWith("/signup")) {
    return null;
  }

  return (
    <>
      <AnnouncementBar />
      <header className="sticky top-0 z-50 border-b shadow-lg"
        style={{ background:"linear-gradient(180deg,#0f1a14 0%,#111d17 100%)", borderColor:"rgba(255,255,255,0.08)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button type="button"
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-stone-300 transition-colors hover:bg-white/8 hover:text-amber-400 md:hidden"
              onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label="Open menu"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/" className="min-w-0 group">
              <span className="block font-serif text-xl italic leading-tight text-amber-400 group-hover:text-amber-300 md:text-2xl">☸ Sarveda</span>
              <span className="mt-0.5 hidden text-[10px] font-normal tracking-[0.22em] text-stone-500 md:block">YOGA · AYURVEDA · SOUND</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-6 lg:gap-8 md:flex" aria-label="Main">
            {MAIN_NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={navLinkClass}>
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

          <div className="hidden shrink-0 items-center gap-4 md:flex" aria-label="Account">
            {sessionUser ? (
              <>
                {isAdminRole(sessionUser.role)
                  ? <Link href="/admin"      className={sessionLinkClass}>Admin panel</Link>
                  : <Link href="/my-account" className={sessionLinkClass}>My account</Link>
                }
                <button type="button" onClick={() => void handleSignOut()} className={sessionLinkClass}>Sign out</button>
              </>
            ) : (
              <>
                <Link href="/login" className={sessionLinkClass}>Sign in</Link>
                <Link href="/signup" className="rounded-full border px-4 py-2 text-sm font-semibold text-amber-300 transition-all hover:bg-amber-500/10" style={{ borderColor:"rgba(200,150,10,0.45)" }}>
                  Sign up
                </Link>
              </>
            )}
          </div>

          <button type="button" onClick={openDrawer} className="flex flex-shrink-0 items-center rounded-xl" aria-label={`Open cart, ${cartCount} items`}>
            <CartIcon count={cartCount} />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col md:hidden" role="dialog" aria-modal="true" aria-label="Navigation" style={{ background:"#0f1a14" }}>
          <div className="flex items-center justify-between border-b px-4 py-4" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
            <span className="font-serif text-xl italic text-amber-400">☸ Menu</span>
            <button type="button" className="flex h-11 min-w-[44px] items-center justify-center rounded-xl text-stone-300 hover:text-amber-400" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-6" aria-label="Mobile main">
            {MAIN_NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-stone-200 hover:bg-white/6 hover:text-amber-400" onClick={() => setMenuOpen(false)}>{l.label}</Link>
            ))}
            <div className="my-2 h-px" style={{ background:"rgba(255,255,255,0.08)" }} />
            {isAdminRole(sessionUser?.role) ? (
              <Link href="/admin" className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-amber-400 hover:bg-white/6" onClick={() => setMenuOpen(false)}>Admin panel</Link>
            ) : sessionUser ? (
              <Link href="/my-account" className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-amber-400 hover:bg-white/6" onClick={() => setMenuOpen(false)}>My account</Link>
            ) : null}
            {sessionUser ? (
              <button type="button" className="min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-medium text-stone-400 hover:bg-white/6" onClick={() => void handleSignOut()}>Sign out</button>
            ) : (
              <>
                <Link href="/login" className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-medium text-stone-300 hover:bg-white/6 hover:text-amber-400" onClick={() => setMenuOpen(false)}>Sign in</Link>
                <Link href="/signup" className="min-h-[52px] rounded-xl px-4 py-3 text-lg font-semibold text-amber-400 hover:bg-white/6" onClick={() => setMenuOpen(false)}>Sign up</Link>
              </>
            )}
            <div className="my-2 h-px" style={{ background:"rgba(255,255,255,0.08)" }} />
            <button type="button" className="min-h-[52px] w-full rounded-xl px-4 py-3 text-left text-lg font-semibold text-amber-400 hover:bg-white/6" onClick={() => { setMenuOpen(false); openDrawer(); }}>
              Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
