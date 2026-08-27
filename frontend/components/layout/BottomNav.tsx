"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { logoutSession } from "@/lib/auth-client";
import { isMainNavActive } from "@/lib/main-nav";
import { MOBILE_MENU_POLICY_LINKS } from "@/lib/policy-links";
import { isShopBrowsePath } from "@/lib/shop-navigation";

import { OPEN_TRACK_ORDER_EVENT } from "./TrackOrderModal";
import { dispatchNavStart } from "./RouteLoadingSpinner";
import { useStorefrontSession } from "./useStorefrontSession";

const NAV_GREEN = "#166D46";

function MenuRowIcon({ kind }: { kind: string }) {
  const cls = "mr-3 h-5 w-5 shrink-0 opacity-95";
  switch (kind) {
    case "track":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16V8z" />
          <path strokeWidth={1.8} strokeLinecap="round" d="M3.3 7L12 12l8.7-5M12 22V12" />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case "details":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" strokeWidth={1.8} />
        </svg>
      );
    case "courses":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M4 19.5A2.5 2.5 0 006.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      );
    case "events":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
          <path strokeWidth={1.8} strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "corporate":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
        </svg>
      );
    case "insights":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M4 19.5h16M8 19V9m4 10V5m4 14v-6" />
        </svg>
      );
    case "explore-events":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
          <path strokeWidth={1.8} strokeLinecap="round" d="M12 7v5l3 2" />
        </svg>
      );
    case "policy":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path strokeWidth={1.8} strokeLinecap="round" d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      );
    case "auth":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" aria-hidden>
          <path strokeWidth={1.8} strokeLinecap="round" d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
        </svg>
      );
    default:
      return null;
  }
}

const accountLinks = [
  { href: "/profile?tab=orders", label: "My orders", tab: "orders" },
  { href: "/profile?tab=details", label: "My profile", tab: "details" },
  { href: "/profile?tab=courses", label: "My Courses", tab: "courses" },
  { href: "/profile?tab=events", label: "My events", tab: "events" }
] as const;

const exploreLinks = [
  { href: "/corporate-wellness", label: "Corporate Wellness" },
  { href: "/insights", label: "Insights" },
  { href: "/events", label: "Events" }
] as const;

type NavItem = {
  key: string;
  label: string;
  href?: string;
  isActive: boolean;
  badge?: number;
  onClick?: () => void;
  icon: (active: boolean) => React.ReactNode;
};

function menuItemClass(active: boolean) {
  return `flex w-full items-center px-4 py-3 text-sm font-medium transition-colors ${
    active ? "bg-white/25 text-white" : "text-white hover:bg-white/15"
  }`;
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { itemCount } = useCartData();
  const sessionUser = useStorefrontSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [showMoreHint, setShowMoreHint] = useState(false);
  const [profileTab, setProfileTab] = useState("details");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProfileTab(new URLSearchParams(window.location.search).get("tab") || "details");
  }, [pathname, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setShowMoreHint(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    const updateHint = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 12;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      setShowMoreHint(canScroll && !atBottom);
    };

    updateHint();
    el.addEventListener("scroll", updateHint, { passive: true });
    const ro = new ResizeObserver(updateHint);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateHint);
      ro.disconnect();
    };
  }, [menuOpen, sessionUser]);

  const activePath = pendingHref ?? pathname;

  const menuActive =
    menuOpen ||
    (pathname?.startsWith("/profile") ?? false) ||
    (pathname?.startsWith("/corporate-wellness") ?? false) ||
    (pathname?.startsWith("/insights") ?? false) ||
    pathname === "/about" ||
    isMainNavActive(activePath, "/events") ||
    MOBILE_MENU_POLICY_LINKS.some((l) => activePath === l.href);

  function navTargetPath(href: string): string {
    if (typeof window === "undefined") return href.split("?")[0] ?? href;
    return new URL(href, window.location.origin).pathname;
  }

  function isSameNavTarget(href: string): boolean {
    const targetPath = navTargetPath(href);
    if (pathname === targetPath) return true;
    if (href === "/shop" && isShopBrowsePath(pathname)) return false;
    return false;
  }

  function go(href: string) {
    if (isSameNavTarget(href)) {
      setMenuOpen(false);
      setPendingHref(null);
      return;
    }
    setPendingHref(href);
    setMenuOpen(false);
    dispatchNavStart();
  }

  function onBottomLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (isSameNavTarget(href)) {
      e.preventDefault();
      setPendingHref(null);
      return;
    }
    go(href);
    // From Home, soft-nav was getting starved by homepage work — push outside a transition.
    // Still allow <Link> default as backup; preventDefault only when we own the push.
    if (pathname === "/") {
      e.preventDefault();
      router.push(href);
    }
  }

  async function handleSignOut() {
    setMenuOpen(false);
    await logoutSession();
    router.replace("/");
    router.refresh();
  }

  const items: NavItem[] = [
    {
      key: "home",
      label: "Home",
      href: "/",
      isActive: activePath === "/",
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"
          />
        </svg>
      )
    },
    {
      key: "courses",
      label: "Courses",
      href: "/courses",
      isActive: isMainNavActive(activePath, "/courses"),
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M4 19.5A2.5 2.5 0 006.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
          />
        </svg>
      )
    },
    {
      key: "store",
      label: "Store",
      href: "/shop",
      isActive: isShopBrowsePath(activePath),
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M3 9.5L5 4h14l2 5.5M3 9.5h18M3 9.5l2 11h14l2-11M9 13.5v5M15 13.5v5"
          />
        </svg>
      )
    },
    {
      key: "cart",
      label: "Cart",
      href: "/cart",
      isActive: activePath === "/cart",
      badge: itemCount,
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2M9 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm9 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
      )
    },
    {
      key: "menu",
      label: menuOpen ? "Close" : "Menu",
      isActive: menuActive,
      onClick: () => setMenuOpen((open) => !open),
      icon: (active) =>
        menuOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.75} d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )
    }
  ];

  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[70] bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {menuOpen ? (
        <div
          className="fixed inset-x-0 z-[80] md:hidden"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px) + 8px)" }}
        >
          <div className="relative mx-auto max-w-lg px-3">
          <div
            className="relative overflow-hidden rounded-xl border border-white/10 shadow-xl"
            style={{ background: NAV_GREEN }}
            role="dialog"
            aria-label="Menu"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/20 px-3 py-2.5">
              <p className="pl-1 text-sm font-semibold text-white">Menu</p>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 active:bg-white/30"
                aria-label="Close menu"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div
              ref={scrollRef}
              className="max-h-[min(70dvh,32rem)] overflow-y-auto"
            >
              <ul className="pt-1">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      window.dispatchEvent(new Event(OPEN_TRACK_ORDER_EVENT));
                    }}
                    className={menuItemClass(false)}
                  >
                    <MenuRowIcon kind="track" />
                    Track my order
                  </button>
                </li>
                {accountLinks.map((link) => {
                  const active = pathname?.startsWith("/profile") && profileTab === link.tab;
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(!!active)} onClick={() => setMenuOpen(false)}>
                        <MenuRowIcon kind={link.tab} />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mx-4 border-t border-white/25" />

              <ul>
                {exploreLinks.map((link) => {
                  const active = isMainNavActive(pathname, link.href);
                  const iconKind =
                    link.href === "/corporate-wellness"
                      ? "corporate"
                      : link.href === "/insights"
                        ? "insights"
                        : "explore-events";
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(active)} onClick={() => setMenuOpen(false)}>
                        <MenuRowIcon kind={iconKind} />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mx-4 border-t border-white/25" />

              <div className="px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Policies</p>
              </div>
              <ul>
                {MOBILE_MENU_POLICY_LINKS.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(active)} onClick={() => setMenuOpen(false)}>
                        <MenuRowIcon kind="policy" />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-white/25 px-3 py-2 pb-3">
                {sessionUser ? (
                  <button type="button" onClick={() => void handleSignOut()} className={menuItemClass(false)}>
                    <MenuRowIcon kind="auth" />
                    Sign out
                  </button>
                ) : (
                  <Link href="/login?next=/profile" className={menuItemClass(false)} onClick={() => setMenuOpen(false)}>
                    <MenuRowIcon kind="auth" />
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            {showMoreHint ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[#166D46] via-[#166D46]/95 to-transparent pb-1 pt-8">
                <svg viewBox="0 0 24 24" className="h-6 w-6 animate-bounce text-white" fill="none" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 9l6 6 6-6" />
                </svg>
                <span className="sr-only">More items below</span>
              </div>
            ) : null}
          </div>

          <div
            className="pointer-events-none absolute -bottom-2 right-[10%] h-0 w-0 -translate-x-1/2"
            style={{
              borderLeft: "10px solid transparent",
              borderRight: "10px solid transparent",
              borderTop: `10px solid ${NAV_GREEN}`
            }}
            aria-hidden
          />
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-[65] border-t border-white/10 safe-area-pb md:hidden"
        style={{ background: NAV_GREEN }}
        aria-label="Primary"
      >
        <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-stretch">
          {items.map((item) => {
            const active = item.isActive;
            const inner = (
              <>
                {active && !item.onClick ? (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-300" />
                ) : null}
                <span className={`transition-colors ${active ? "text-amber-300" : "text-white"}`}>
                  {item.icon(active)}
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="absolute right-2 top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold text-brand-night">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
                <span
                  className={`text-[10px] font-semibold tracking-wide transition-colors ${
                    active ? "text-amber-200" : "text-white"
                  }`}
                >
                  {item.label}
                </span>
              </>
            );

            if (item.onClick) {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  aria-expanded={menuOpen}
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  className="relative flex flex-col items-center justify-center gap-1 transition-opacity active:opacity-70"
                >
                  {inner}
                </button>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href!}
                prefetch
                aria-current={active ? "page" : undefined}
                onClick={(e) => onBottomLinkClick(e, item.href!)}
                className="relative flex flex-col items-center justify-center gap-1 transition-opacity active:opacity-70"
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
