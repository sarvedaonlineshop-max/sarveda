"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartData } from "@/components/cart/CartProvider";

export function MobileCartBar() {
  const pathname = usePathname();
  const { itemCount: count } = useCartData();

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login")) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-800 bg-stone-900/95 px-4 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] backdrop-blur-sm md:hidden safe-area-pb">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <Link
          href="/shop"
          className="flex min-h-[48px] min-w-[48px] flex-1 items-center justify-center rounded-lg text-sm font-medium tracking-wide text-stone-300 transition-colors hover:text-amber-400"
        >
          Shop
        </Link>
        <Link
          href="/cart"
          className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-lg bg-stone-800 px-4 text-amber-400 transition-colors hover:bg-stone-700"
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
          </span>
          <span className="font-medium">Cart</span>
          {count > 0 ? (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-stone-900">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Link>
      </div>
    </div>
  );
}
