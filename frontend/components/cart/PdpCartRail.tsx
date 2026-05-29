"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cartRemove, cartUpdate } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

/**
 * Amazon-style fixed cart column on PDP (desktop). Page scrolls underneath; rail stays fixed.
 */
export function PdpCartRail() {
  const { items, subtotalInPaise, itemCount, refreshCart } = useCartData();
  const [busy, setBusy] = useState<string | null>(null);

  if (itemCount === 0) return null;

  const setQty = async (variantId: string, quantity: number) => {
    setBusy(variantId);
    try {
      if (quantity < 1) {
        await cartRemove(variantId);
      } else {
        await cartUpdate(variantId, quantity);
      }
      await refreshCart();
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside
      className="fixed right-0 top-24 z-30 hidden h-[calc(100vh-6rem)] w-[min(100%,20rem)] flex-col border-l border-stone-200 bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.06)] xl:flex 2xl:w-80"
      aria-label="Cart summary"
    >
      <div className="border-b border-stone-100 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Subtotal</p>
        <p className="mt-1 font-serif text-2xl font-semibold text-[#b85c38]">
          {formatINRFromPaise(subtotalInPaise)}
        </p>
        <Link
          href="/cart"
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-900 transition hover:border-stone-900"
        >
          Go to Cart
        </Link>
        <Link
          href="/checkout"
          className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#108967] text-sm font-semibold text-white transition hover:bg-[#0d7353]"
        >
          Checkout
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-4">
          {items.map((line) => (
            <li key={line.variantId} className="flex gap-3 border-b border-stone-100 pb-4 last:border-0">
              <Link
                href={`/product/${line.productSlug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-100 bg-stone-50"
              >
                {line.primaryImageUrl ? (
                  <Image src={line.primaryImageUrl} alt="" fill className="object-cover" sizes="80px" unoptimized />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-stone-400">—</div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#b85c38]">{formatINRFromPaise(line.unitPriceInPaise)}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-snug text-stone-700">{line.productName}</p>
                {line.variantLabel ? (
                  <p className="mt-0.5 text-[10px] text-stone-500">{line.variantLabel}</p>
                ) : null}
                <div className="mt-2 inline-flex items-center rounded-full border-2 border-amber-400 bg-white">
                  <button
                    type="button"
                    disabled={!!busy}
                    className="flex h-8 w-8 items-center justify-center text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                    aria-label={line.quantity === 1 ? "Remove item" : "Decrease quantity"}
                    onClick={() => void setQty(line.variantId, line.quantity - 1)}
                  >
                    {line.quantity === 1 ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    ) : (
                      "−"
                    )}
                  </button>
                  <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums text-stone-900">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    disabled={!!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)}
                    className="flex h-8 w-8 items-center justify-center text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                    aria-label="Increase quantity"
                    onClick={() => void setQty(line.variantId, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
