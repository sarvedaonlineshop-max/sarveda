"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";

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
      <div className="mt-10 rounded-2xl border border-stone-100 bg-white p-10 text-center shadow-sm">
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
    <div className="mt-8 space-y-6">
      <ul className="space-y-4">
        {items.map((line) => (
          <li
            key={line.variantId}
            className="flex flex-col gap-4 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm sm:flex-row sm:items-start"
          >
            <Link
              href={`/product/${line.productSlug}`}
              className="relative mx-auto h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:mx-0"
            >
              {line.primaryImageUrl ? (
                <Image
                  src={line.primaryImageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="112px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-stone-400">No image</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/product/${line.productSlug}`}
                className="font-medium text-stone-900 hover:text-amber-800"
              >
                {line.productName}
              </Link>
              {line.variantLabel ? <p className="mt-1 text-sm text-stone-500">{line.variantLabel}</p> : null}
              <p className="mt-2 text-sm font-semibold text-amber-800">
                {formatINRFromPaise(line.unitPriceInPaise)} each
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50">
                  <button
                    type="button"
                    disabled={!!busy}
                    className="flex h-11 min-w-[44px] items-center justify-center text-lg text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                    aria-label="Decrease quantity"
                    onClick={() => void setQty(line.variantId, line.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="min-w-[2.5rem] text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    disabled={
                      !!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)
                    }
                    className="flex h-11 min-w-[44px] items-center justify-center text-lg text-stone-700 hover:bg-stone-100 disabled:opacity-50"
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
                  className="min-h-[44px] text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              <p className="mt-3 text-sm text-stone-600">
                Line total:{" "}
                <span className="font-semibold text-amber-800">
                  {formatINRFromPaise(line.unitPriceInPaise * line.quantity)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-stone-500">{itemCount} items</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-amber-800">
              {formatINRFromPaise(subtotalInPaise)}
            </p>
            <p className="text-xs text-stone-500">Subtotal · GST included · Shipping at checkout</p>
          </div>
          <Link
            href="/checkout"
            className="inline-flex min-h-[52px] min-w-[200px] items-center justify-center rounded-2xl bg-stone-900 px-8 font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white"
          >
            Proceed to checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
