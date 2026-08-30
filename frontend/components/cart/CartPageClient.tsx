"use client";

import Image from "next/image";
import Link from "next/link";

import { CartCheckoutSidebar } from "@/components/cart/CartCheckoutSidebar";
import { CartLineQuantity } from "@/components/cart/CartLineQuantity";
import { formatMinorFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

export function CartPageClient() {
  const { items, subtotalInPaise, itemCount, loading, removeLine, isCartMutating, currency } = useCartData();

  if (loading && items.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center" role="status">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-brand-cream-dark border-t-[#108967]"
          aria-hidden
        />
        <p className="text-sm text-stone-500">Loading cart…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-none border-y border-brand-cream-dark bg-white p-8 text-center md:mt-10 md:rounded-2xl md:border md:shadow-card">
        <p className="text-brand-muted">Your cart is empty.</p>
        <Link
          href="/store"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#166D46] px-8 font-semibold text-white transition-colors hover:bg-[#145a3a]"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 md:mt-8">
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 xl:gap-8">
        <div className="min-w-0 lg:col-span-8 xl:col-span-9">
          <p className="mb-3 hidden text-sm text-brand-muted lg:block">
            Shopping Cart · {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
          <ul className="divide-y divide-brand-cream-dark border-y border-brand-cream-dark bg-white lg:divide-none lg:space-y-4 lg:border-0 lg:bg-transparent">
            {items.map((line) => (
              <li
                key={line.variantId}
                className="flex flex-row items-start gap-3 p-4 sm:gap-4 lg:rounded-2xl lg:border lg:border-brand-cream-dark lg:bg-white lg:p-5 lg:shadow-card"
              >
                <Link
                  href={`/product/${line.productSlug}`}
                  className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-[#EDE4D3] sm:h-28 sm:w-28 lg:h-32 lg:w-32"
                >
                  {line.primaryImageUrl ? (
                    <Image
                      src={line.primaryImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="128px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-400">No image</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/product/${line.productSlug}`}
                      className="font-sans text-sm font-medium leading-snug text-brand-ink hover:text-brand-forest sm:text-base lg:text-lg"
                    >
                      {line.productName}
                    </Link>
                    <button
                      type="button"
                      disabled={isCartMutating}
                      onClick={() => void removeLine(line.variantId)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-muted transition-colors hover:bg-brand-cream hover:text-brand-terra disabled:opacity-50"
                      aria-label={`Remove ${line.productName} from cart`}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden>
                        <path
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                  {line.variantLabel ? <p className="mt-0.5 text-xs text-brand-muted sm:text-sm">{line.variantLabel}</p> : null}
                  <p className="mt-1.5 font-sans text-sm font-semibold tabular-nums text-brand-forest sm:text-base">
                    {formatMinorFromPaise(line.unitPriceInPaise, currency)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <CartLineQuantity line={line} size="md" />
                    <p className="text-sm font-semibold text-brand-ink sm:text-base">
                      {formatMinorFromPaise(line.unitPriceInPaise * line.quantity, currency)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="mt-6 hidden lg:sticky lg:top-28 lg:col-span-4 lg:mt-0 lg:block lg:self-start xl:col-span-3">
          <CartCheckoutSidebar mode="cart-page" />
        </aside>
      </div>

      <div className="mt-6 border-t border-brand-cream-dark bg-brand-cream p-4 lg:hidden">
        <p className="text-sm text-brand-muted">{itemCount} items</p>
        <p className="font-sans text-2xl font-semibold tabular-nums text-brand-ink">
          {formatMinorFromPaise(subtotalInPaise, currency)}
        </p>
        <Link
          href="/checkout"
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-full bg-brand-gold text-base font-semibold text-brand-night transition-colors hover:bg-[#a37934]"
        >
          Proceed to Buy
        </Link>
      </div>
    </div>
  );
}
