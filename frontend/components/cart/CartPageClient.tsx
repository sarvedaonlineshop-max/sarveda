"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { checkoutSummaryBoxClass } from "@/lib/checkout-ui";
import { cartRemove, cartUpdate } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

const rowBorder = "border-b border-[rgba(196,176,232,0.22)]";

export function CartPageClient() {
  const { items, subtotalInPaise, discountInPaise, coupon, itemCount, loading, refreshCart } =
    useCartData();
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
      <p className="mt-10 text-center font-light text-brand-mid" role="status">
        Loading cart…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`mt-6 text-center md:mt-10 ${checkoutSummaryBoxClass}`}>
        <p className="text-brand-mid">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-violet px-8 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-brand-violet-mid"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 md:mt-8">
      <ul className="md:rounded-2xl md:border md:border-[rgba(196,176,232,0.25)] md:bg-brand-ivory">
        {items.map((line) => (
          <li
            key={line.variantId}
            className={`flex flex-col gap-4 py-5 sm:flex-row sm:items-start md:px-5 ${rowBorder} last:border-b-0`}
          >
            <Link
              href={`/product/${line.productSlug}`}
              className="relative mx-auto h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl border border-[rgba(196,176,232,0.2)] bg-brand-violet-light sm:mx-0"
            >
              {line.primaryImageUrl ? (
                <Image
                  src={line.primaryImageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="72px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-brand-muted">No image</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              {line.variantLabel ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-brand-violet">
                  {line.variantLabel}
                </p>
              ) : null}
              <Link
                href={`/product/${line.productSlug}`}
                className="display-text mt-1 block text-lg font-normal leading-snug text-brand-ink hover:text-brand-violet"
              >
                {line.productName}
              </Link>
              <p className="price-text mt-2 text-base font-medium text-brand-ink">
                {formatINRFromPaise(line.unitPriceInPaise)} each
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-[10px] border border-[rgba(196,176,232,0.3)]">
                  <button
                    type="button"
                    disabled={!!busy}
                    className="flex h-11 min-w-[44px] items-center justify-center text-lg text-brand-violet hover:bg-brand-violet-light disabled:opacity-50"
                    aria-label="Decrease quantity"
                    onClick={() => void setQty(line.variantId, line.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="price-text min-w-[2.5rem] text-center text-sm font-medium tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    disabled={!!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)}
                    className="flex h-11 min-w-[44px] items-center justify-center text-lg text-brand-violet hover:bg-brand-violet-light disabled:opacity-50"
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
                  className="min-h-[44px] text-sm font-light text-brand-mid underline-offset-2 hover:text-brand-violet hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
              <p className="price-text mt-3 text-base font-medium text-brand-ink">
                Line total: {formatINRFromPaise(line.unitPriceInPaise * line.quantity)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className={`mt-6 ${checkoutSummaryBoxClass}`}>
        <h2 className="display-text text-[22px] font-normal text-brand-ink">Order summary</h2>
        <dl className="mt-4 space-y-2 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="font-light text-brand-mid">{itemCount} items · Subtotal</dt>
            <dd className="price-text font-medium text-brand-ink">{formatINRFromPaise(subtotalInPaise)}</dd>
          </div>
          {discountInPaise > 0 && coupon ? (
            <div className="flex justify-between gap-4">
              <dt className="font-light text-brand-mid">Coupon ({coupon.code})</dt>
              <dd className="price-text font-medium text-brand-green">−{formatINRFromPaise(discountInPaise)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-[rgba(196,176,232,0.22)] pt-3">
            <dt className="font-light text-brand-mid">Estimated total</dt>
            <dd className="price-text text-[15px] font-semibold text-brand-ink">
              {formatINRFromPaise(Math.max(0, subtotalInPaise - discountInPaise))}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs font-light text-brand-muted">GST included · Shipping at checkout</p>
        <Link
          href="/checkout"
          className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand-violet py-4 text-[15px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand-violet-mid"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
