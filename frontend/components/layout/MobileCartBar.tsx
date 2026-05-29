"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCartData, useCartUi } from "@/components/cart/CartProvider";

export function MobileCartBar() {
  const pathname = usePathname();
  const { openDrawer } = useCartUi();
  const { itemCount: count } = useCartData();

  if (pathname?.startsWith("/admin") || pathname?.startsWith("/login")) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-violet/40 bg-brand-violet-deep/95 px-4 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.12)] backdrop-blur-sm md:hidden safe-area-pb">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <Link
          href="/shop"
          className="flex min-h-[48px] min-w-[48px] flex-1 items-center justify-center rounded-lg text-sm font-medium tracking-wide text-brand-lavender-mid/50 transition-colors hover:text-brand-gold"
        >
          Shop
        </Link>
        <button
          type="button"
          onClick={openDrawer}
          className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-lg bg-brand-violet-deep px-4 text-brand-gold transition-colors hover:bg-brand-violet-mid"
        >
          <span className="text-lg" aria-hidden="true">
            🛒
          </span>
          <span className="font-medium">Cart</span>
          {count > 0 ? (
            <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs font-semibold text-brand-ink">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
