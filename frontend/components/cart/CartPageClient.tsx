"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";

import { CartCheckoutSidebar } from "@/components/cart/CartCheckoutSidebar";
import { cartRemove, cartUpdate } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

export function CartPageClient() {
  const { items, subtotalInPaise, itemCount, loading, refreshCart } = useCartData();
  const [busy, setBusy] = useState<string | null>(null);

  async function setQty(variantId: string, quantity: number) {
    setBusy(variantId);
    try {
      await cartUpdate(variantId, quantity);
      await refreshCart();
    } finally {
      setBusy(null);
    }
  }

  async function remove(variantId: string) {
    setBusy(variantId);
    try {
      await cartRemove(variantId);
      await refreshCart();
    } finally {
      setBusy(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <p className="mt-10 text-center text-stone-500" role="status">
        Loading cart…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-6 rounded-none border-y border-stone-200 bg-white p-8 text-center md:mt-10 md:rounded-2xl md:border md:shadow-sm">
        <p className="text-stone-500">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-stone-900 px-8 font-semibold text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 md:mt-8">
      {/* Desktop: items scroll left, sticky Proceed to Buy right (Amazon cart layout) */}
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 xl:gap-8">
        <div className="min-w-0 lg:col-span-8 xl:col-span-9">
          <p className="mb-3 hidden text-sm text-stone-500 lg:block">
            Shopping Cart · {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
          <ul className="divide-y divide-stone-200 border-y border-stone-200 bg-white lg:divide-none lg:space-y-4 lg:border-0 lg:bg-transparent">
            {items.map((line) => (
              <li
                key={line.variantId}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start lg:rounded-2xl lg:border lg:border-stone-100 lg:bg-white lg:p-5 lg:shadow-sm"
              >
                <Link
                  href={`/product/${line.productSlug}`}
                  className="relative mx-auto h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:mx-0 lg:h-32 lg:w-32"
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
                  <Link
                    href={`/product/${line.productSlug}`}
                    className="font-medium text-stone-900 hover:text-amber-800 lg:text-lg"
                  >
                    {line.productName}
                  </Link>
                  {line.variantLabel ? <p className="mt-1 text-sm text-stone-500">{line.variantLabel}</p> : null}
                  <p className="mt-2 text-base font-semibold text-[#b85c38]">
                    {formatINRFromPaise(line.unitPriceInPaise)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border-2 border-amber-400 bg-white">
                      <button
                        type="button"
                        disabled={!!busy}
                        className="flex h-9 w-9 items-center justify-center text-stone-700 disabled:opacity-50"
                        aria-label="Decrease quantity"
                        onClick={() => void setQty(line.variantId, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={
                          !!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)
                        }
                        className="flex h-9 w-9 items-center justify-center disabled:opacity-50"
                        aria-label="Increase quantity"
                        onClick={() => void setQty(line.variantId, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void remove(line.variantId)}
                      className="text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-right text-base font-semibold text-stone-900 sm:ml-auto sm:self-start lg:min-w-[5rem]">
                  {formatINRFromPaise(line.unitPriceInPaise * line.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky checkout box — stays visible while scrolling items */}
        <aside className="mt-6 hidden lg:sticky lg:top-28 lg:col-span-4 lg:mt-0 lg:block lg:self-start xl:col-span-3">
          <CartCheckoutSidebar mode="cart-page" />
        </aside>
      </div>

      {/* Mobile: checkout bar at bottom of list */}
      <div className="mt-6 border-t border-stone-200 bg-white p-4 lg:hidden">
        <p className="text-sm text-stone-500">{itemCount} items</p>
        <p className="font-serif text-2xl font-semibold text-amber-800">{formatINRFromPaise(subtotalInPaise)}</p>
        <Link
          href="/checkout"
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-lg bg-[#ffd814] text-base font-medium text-stone-900"
        >
          Proceed to Buy
        </Link>
      </div>
    </div>
  );
}
