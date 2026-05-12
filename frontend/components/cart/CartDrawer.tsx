"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { cartRemove, cartUpdate } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CartDrawer({ open, onClose }: Props) {
  const { items, subtotalInPaise, itemCount, refreshCart } = useCartData();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (open) {
      window.addEventListener("keydown", onKey);
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setQty = async (variantId: string, quantity: number) => {
    setBusy(variantId);
    try {
      await cartUpdate(variantId, quantity);
      await refreshCart();
    } catch (error) {
      console.error(error);
      await refreshCart();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (variantId: string) => {
    setBusy(variantId);
    try {
      await cartRemove(variantId);
      await refreshCart();
    } catch (error) {
      console.error(error);
      await refreshCart();
    } finally {
      setBusy(null);
    }
  };

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      side="right"
      title="Your cart"
      subtitle={`${itemCount} ${itemCount === 1 ? "item" : "items"} · Synced with Sarveda`}
      ariaLabel="Shopping cart"
      footer={
        items.length > 0 ? (
          <div className="px-4 py-5">
            <div className="flex items-center justify-between text-sm text-stone-600">
              <span>Subtotal</span>
              <span className="font-serif text-xl font-semibold text-amber-800">
                {formatINRFromPaise(subtotalInPaise)}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">GST included · Shipping calculated at checkout</p>
            <Link
              href="/checkout"
              onClick={onClose}
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-center text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white"
            >
              Proceed to checkout
            </Link>
            <Link
              href="/cart"
              onClick={onClose}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center text-sm font-medium text-stone-600 underline-offset-2 hover:text-amber-800 hover:underline"
            >
              View full cart
            </Link>
          </div>
        ) : undefined
      }
    >
      <div className="px-4 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-stone-500">Your cart is empty.</p>
            <Link
              href="/shop"
              onClick={onClose}
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-stone-900 px-8 font-semibold text-amber-400 transition-colors hover:bg-amber-700 hover:text-white"
            >
              Continue shopping
            </Link>
          </div>
        ) : (
          <ul className="space-y-3 md:space-y-4">
            {items.map((line) => (
              <li
                key={line.variantId}
                className="flex gap-3 rounded-none border-b border-stone-200 bg-white p-3 md:rounded-2xl md:border md:border-stone-100 md:shadow-sm"
              >
                <Link
                  href={`/product/${line.productSlug}`}
                  onClick={onClose}
                  className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-stone-100"
                >
                  {line.primaryImageUrl ? (
                    <Image
                      src={line.primaryImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="96px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-stone-400">No image</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${line.productSlug}`}
                    onClick={onClose}
                    className="font-medium leading-snug text-stone-900 hover:text-amber-800"
                  >
                    {line.productName}
                  </Link>
                  {line.variantLabel ? <p className="mt-0.5 text-xs text-stone-500">{line.variantLabel}</p> : null}
                  <p className="mt-1 text-sm font-semibold text-amber-800">
                    {formatINRFromPaise(line.unitPriceInPaise)}
                    <span className="font-normal text-stone-400"> / unit</span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
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
                      <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums text-stone-900">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={!!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)}
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
                      className="min-h-[44px] px-2 text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SlideDrawer>
  );
}
