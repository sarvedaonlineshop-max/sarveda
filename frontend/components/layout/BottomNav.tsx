"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { MOBILE_MENU_POLICY_LINKS } from "@/lib/policy-links";
import { isShopBrowsePath } from "@/lib/shop-navigation";

const menuLinks = [
  { href: "/courses", label: "Courses" },
  { href: "/corporate-wellness", label: "Corporate Wellness" },
  { href: "/insights", label: "Insights" },
  { href: "/events", label: "Events" }
];

type NavItem = {
  key: string;
  label: string;
  href?: string;
  isActive: boolean;
  badge?: number;
  onClick?: () => void;
  icon: (active: boolean) => React.ReactNode;
};

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { itemCount } = useCartData();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setMenuOpen(false);
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const activePath = pendingHref ?? pathname;

  const menuActive =
    menuLinks.some((l) => activePath?.startsWith(l.href)) ||
    MOBILE_MENU_POLICY_LINKS.some((l) => activePath === l.href);

  function go(href: string) {
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
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
      key: "profile",
      label: "Profile",
      href: "/profile",
      isActive: activePath?.startsWith("/profile") ?? false,
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
          />
        </svg>
      )
    },
    {
      key: "menu",
      label: "Menu",
      isActive: menuActive || menuOpen,
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
          className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[70] mx-3 mb-2 max-h-[min(70dvh,32rem)] overflow-hidden rounded-xl border border-white/10 shadow-xl md:hidden"
          style={{ background: "linear-gradient(180deg,#152019 0%,#0f1a14 100%)" }}
          role="dialog"
          aria-label="Explore Sarveda"
        >
          <div className="max-h-[min(70dvh,32rem)] overflow-y-auto">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/80">Explore</p>
            </div>
            <ul className="py-2">
              {menuLinks.map((link) => {
                const active = pathname?.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                        active ? "bg-white/10 text-amber-200" : "text-stone-100 hover:bg-white/5"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/80">Policies</p>
            </div>
            <ul className="pb-2">
              {MOBILE_MENU_POLICY_LINKS.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                        active ? "bg-white/10 text-amber-200" : "text-stone-100 hover:bg-white/5"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 safe-area-pb md:hidden"
        style={{ background: "linear-gradient(180deg,#0f1a14 0%,#0c1510 100%)", backdropFilter: "blur(16px)" }}
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
                <span className={`transition-colors ${active ? "text-amber-300" : "text-stone-300"}`}>
                  {item.icon(active)}
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="absolute right-2 top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold text-brand-night">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
                <span
                  className={`text-[10px] font-semibold tracking-wide transition-colors ${
                    active ? "text-amber-200" : "text-stone-300"
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
