"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartData } from "@/components/cart/CartProvider";

const navStyle = {
  background: "rgba(22,8,58,0.96)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderTop: "2px solid rgba(91,62,155,0.4)",
  boxShadow: "0 -4px 24px rgba(10,4,30,0.4)",
} as const;

function HomeIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
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

function CoursesIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
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

type NavItem = {
  key: string;
  label: string;
  href: string;
  isActive: boolean;
  badge?: number;
  icon: React.ReactNode;
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
      icon: <HomeIcon />,
    },
    {
      key: "store",
      label: "Store",
      href: "/shop",
      isActive:
        (pathname?.startsWith("/shop") ?? false) ||
        (pathname?.startsWith("/product") ?? false) ||
        (pathname?.startsWith("/product-category") ?? false),
      icon: <StoreIcon />,
    },
    {
      key: "courses",
      label: "Courses",
      href: "/courses",
      isActive:
        (pathname?.startsWith("/courses") ?? false) ||
        (pathname?.startsWith("/course/") ?? false),
      icon: <CoursesIcon />,
    },
    {
      key: "events",
      label: "Events",
      href: "/events",
      isActive:
        (pathname?.startsWith("/events") ?? false) ||
        (pathname?.startsWith("/event/") ?? false),
      icon: <EventsIcon />,
    },
    {
      key: "cart",
      label: "Cart",
      href: "/cart",
      isActive: pathname === "/cart",
      badge: itemCount,
      icon: <CartIcon />,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 safe-area-pb md:hidden"
      style={navStyle}
      aria-label="Primary"
    >
      <div className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-stretch">
        {items.map((item) => {
          const active = item.isActive;
          const colorClass = active ? "text-brand-lavender" : "text-[rgba(123,94,192,0.5)]";

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center justify-center gap-1 transition-opacity active:opacity-70"
            >
              {active && (
                <span
                  className="absolute top-0 rounded-full"
                  style={{ width: 24, height: 2, background: "#5B3E9B" }}
                  aria-hidden
                />
              )}

              <span className={`relative transition-colors ${colorClass}`}>{item.icon}</span>

              {item.badge != null && item.badge > 0 ? (
                <span
                  className="absolute right-2 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold text-white"
                  style={{ background: "#5B3E9B" }}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}

              <span
                className={`text-[10px] font-medium tracking-[0.04em] transition-colors ${colorClass}`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
