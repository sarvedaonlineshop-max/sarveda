"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartData } from "@/components/cart/CartProvider";

type NavItem = {
  key: string;
  label: string;
  href: string;
  isActive: boolean;
  badge?: number;
  icon: (active: boolean) => React.ReactNode;
};

export function BottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCartData();

  const items: NavItem[] = [
    {
      key: "home",
      label: "Home",
      href: "/",
      isActive: pathname === "/",
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"
          />
        </svg>
      )
    },
    {
      key: "search",
      label: "Search",
      href: "/search",
      isActive: pathname?.startsWith("/search") ?? false,
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" strokeWidth={active ? 2 : 1.75} />
          <path strokeLinecap="round" strokeWidth={active ? 2 : 1.75} d="M16.5 16.5L21 21" />
        </svg>
      )
    },
    {
      key: "cart",
      label: "Cart",
      href: "/cart",
      isActive: pathname === "/cart",
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
      label: "You",
      href: "/profile",
      isActive: pathname?.startsWith("/profile") ?? false,
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
          />
        </svg>
      )
    },
    {
      key: "chat",
      label: "Chat",
      href: "/chat",
      isActive: pathname?.startsWith("/chat") ?? false,
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" className="h-6 w-6" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 0 : 1.75}
            d="M8 10h8M8 14h5M5 19l1.5-3H19a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2z"
          />
        </svg>
      )
    }
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 safe-area-pb md:hidden"
      style={{ background: "linear-gradient(180deg,#0f1a14 0%,#0c1510 100%)", backdropFilter:"blur(16px)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-stretch">
        {items.map((item) => {
          const active = item.isActive;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center justify-center gap-1 transition-opacity active:opacity-70"
            >
              {/* Active bar indicator at top */}
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-300" />
              )}

              {/* Icon */}
              <span className={`transition-colors ${active ? "text-amber-300" : "text-stone-300"}`}>
                {item.icon(active)}
              </span>

              {/* Badge */}
              {item.badge && item.badge > 0 ? (
                <span className="absolute right-3 top-3 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-gold px-1 text-[9px] font-bold text-brand-night">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}

              {/* Label */}
              <span className={`text-[10px] font-semibold tracking-wide transition-colors ${active ? "text-amber-200" : "text-stone-300"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
