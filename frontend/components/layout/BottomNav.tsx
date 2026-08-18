"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { logoutSession } from "@/lib/auth-client";
import { isMainNavActive } from "@/lib/main-nav";
import { MOBILE_MENU_POLICY_LINKS } from "@/lib/policy-links";
import { isShopBrowsePath } from "@/lib/shop-navigation";

import { OPEN_TRACK_ORDER_EVENT } from "./TrackOrderModal";
import { useStorefrontSession } from "./useStorefrontSession";

const NAV_GREEN = "#1c352a";

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
    active ? "bg-white/15 text-white" : "text-white hover:bg-white/10"
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
  const [, startTransition] = useTransition();
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
    isMainNavActive(activePath, "/events") ||
    MOBILE_MENU_POLICY_LINKS.some((l) => activePath === l.href);

  function go(href: string) {
    setPendingHref(href);
    if (isShopBrowsePath(href)) {
      router.push(href);
      return;
    }
    startTransition(() => {
      router.push(href);
    });
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
      label: "Menu",
      isActive: menuActive,
      onClick: () => setMenuOpen((open) => !open),
      icon: (active) => (
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
          className="fixed inset-0 z-[60] bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      {menuOpen ? (
        <div
          className="fixed inset-x-0 z-[70] md:hidden"
          style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px) + 8px)" }}
        >
          <div className="relative mx-auto max-w-lg px-3">
          <div
            className="relative overflow-hidden rounded-xl border border-white/10 shadow-xl"
            style={{ background: NAV_GREEN }}
            role="dialog"
            aria-label="Menu"
          >
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
                    Track my order
                  </button>
                </li>
                {accountLinks.map((link) => {
                  const active = pathname?.startsWith("/profile") && profileTab === link.tab;
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(!!active)} onClick={() => setMenuOpen(false)}>
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
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(active)} onClick={() => setMenuOpen(false)}>
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mx-4 border-t border-white/25" />

              <div className="px-4 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">Policies</p>
              </div>
              <ul>
                {MOBILE_MENU_POLICY_LINKS.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <li key={link.href}>
                      <Link href={link.href} className={menuItemClass(active)} onClick={() => setMenuOpen(false)}>
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-white/25 px-3 py-2 pb-3">
                {sessionUser ? (
                  <button type="button" onClick={() => void handleSignOut()} className={menuItemClass(false)}>
                    Sign out
                  </button>
                ) : (
                  <Link href="/login?next=/profile" className={menuItemClass(false)} onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                )}
              </div>
            </div>

            {showMoreHint ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[#1c352a] via-[#1c352a]/90 to-transparent pb-1 pt-8">
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
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 safe-area-pb md:hidden"
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
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.href!);
                }}
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
