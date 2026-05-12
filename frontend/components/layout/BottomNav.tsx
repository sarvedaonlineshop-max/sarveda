"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";

type NavItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive: boolean;
  icon: React.ReactNode;
  badge?: number;
};

function NavIcon({
  children,
  active
}: {
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <span
      className={`flex h-6 w-6 items-center justify-center transition-colors ${
        active ? "text-amber-400" : "text-stone-400"
      }`}
    >
      {children}
    </span>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { openDrawer, drawerOpen } = useCartUi();
  const { itemCount } = useCartData();

  const items: NavItem[] = [
    {
      key: "home",
      label: "Home",
      href: "/",
      isActive: pathname === "/",
      icon: (
        <NavIcon active={pathname === "/"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"
            />
          </svg>
        </NavIcon>
      )
    },
    {
      key: "search",
      label: "Search",
      href: "/search",
      isActive: pathname?.startsWith("/search") ?? false,
      icon: (
        <NavIcon active={pathname?.startsWith("/search") ?? false}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M10.5 18a7.5 7.5 0 117.5-7.5 7.5 7.5 0 01-7.5 7.5zM16.5 16.5L21 21"
            />
          </svg>
        </NavIcon>
      )
    },
    {
      key: "cart",
      label: "Cart",
      onClick: openDrawer,
      isActive: drawerOpen || pathname === "/cart",
      badge: itemCount,
      icon: (
        <NavIcon active={drawerOpen || pathname === "/cart"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M6 6h15l-1.5 9h-12L6 6zm0 0L5 3H2M9 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm9 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
            />
          </svg>
        </NavIcon>
      )
    },
    {
      key: "account",
      label: "Account",
      href: "/login",
      isActive: pathname?.startsWith("/login") || pathname?.startsWith("/signup") || false,
      icon: (
        <NavIcon
          active={
            pathname?.startsWith("/login") || pathname?.startsWith("/signup") || false
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM5.25 19.5a7.5 7.5 0 0113.5 0"
            />
          </svg>
        </NavIcon>
      )
    }
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-800 bg-stone-950/95 backdrop-blur-md md:hidden safe-area-pb"
      aria-label="Primary"
    >
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-4 items-stretch">
        {items.map((item) => {
          const labelClass = item.isActive ? "text-amber-400" : "text-stone-500";
          const content = (
            <>
              <span className="relative">
                {item.icon}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-stone-900">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className={`text-[11px] font-medium tracking-wide ${labelClass}`}>{item.label}</span>
            </>
          );

          if (item.onClick) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="flex flex-col items-center justify-center gap-1"
                aria-label={`${item.label}${item.badge ? `, ${item.badge} items` : ""}`}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href ?? "/"}
              className="flex flex-col items-center justify-center gap-1"
              aria-current={item.isActive ? "page" : undefined}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
