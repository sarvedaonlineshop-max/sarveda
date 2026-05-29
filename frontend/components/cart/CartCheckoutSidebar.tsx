"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cartRemove, cartUpdate } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";
import type { CartApiItem } from "@/lib/cart-api";

import { useCartData } from "./CartProvider";

type Props = {
  mode: "pdp-rail" | "cart-page";
  className?: string;
};

function CompactLine({
  line,
  busy,
  onQty
}: {
  line: CartApiItem;
  busy: string | null;
  onQty: (variantId: string, quantity: number) => void;
}) {
  return (
    <li className="border-b border-stone-100 py-2.5 last:border-0">
      <p className="text-sm font-semibold leading-tight text-[#b85c38]">
        {formatINRFromPaise(line.unitPriceInPaise)}
      </p>
      <div className="mt-1.5 flex gap-2">
        <Link
          href={`/product/${line.productSlug}`}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-stone-100 bg-stone-50"
        >
          {line.primaryImageUrl ? (
            <Image src={line.primaryImageUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] leading-snug text-stone-700">{line.productName}</p>
          <div className="mt-1.5 inline-flex max-w-full items-center rounded-full border-2 border-amber-400 bg-white">
            <button
              type="button"
              disabled={!!busy}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-stone-600 disabled:opacity-50"
              aria-label={line.quantity === 1 ? "Remove" : "Decrease"}
              onClick={() => onQty(line.variantId, line.quantity - 1)}
            >
              {line.quantity === 1 ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
            <button
              type="button"
              disabled={!!busy || (line.maxQuantity != null && line.quantity >= line.maxQuantity)}
              className="flex h-7 w-7 shrink-0 items-center justify-center disabled:opacity-50"
              aria-label="Increase"
              onClick={() => onQty(line.variantId, line.quantity + 1)}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function CartCheckoutSidebar({ mode, className = "" }: Props) {
  const { items, subtotalInPaise, itemCount, refreshCart } = useCartData();
  const [busy, setBusy] = useState<string | null>(null);

  const count = itemCount > 0 ? itemCount : items.reduce((n, i) => n + i.quantity, 0);
  if (count === 0 && items.length === 0) return null;

  const setQty = async (variantId: string, quantity: number) => {
    setBusy(variantId);
    try {
      if (quantity < 1) await cartRemove(variantId);
      else await cartUpdate(variantId, quantity);
      await refreshCart();
    } finally {
      setBusy(null);
    }
  };

  const isRail = mode === "pdp-rail";

  return (
    <div className={className}>
      <div className={`border-stone-200 bg-white ${isRail ? "border-b px-3 py-3" : "rounded-lg border p-4 shadow-sm"}`}>
        <p className="text-[11px] text-stone-600">
          Subtotal ({count} {count === 1 ? "item" : "items"}):
        </p>
        <p className="mt-0.5 text-lg font-semibold text-stone-900">{formatINRFromPaise(subtotalInPaise)}</p>

        <Link
          href="/checkout"
          className="mt-3 flex min-h-[40px] w-full items-center justify-center rounded-lg bg-[#ffd814] text-sm font-medium text-stone-900 shadow-sm transition hover:bg-[#f7ca00]"
        >
          Proceed to Buy
        </Link>

        {isRail ? (
          <Link
            href="/cart"
            className="mt-2 flex min-h-[36px] w-full items-center justify-center rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-800 hover:bg-stone-50"
          >
            Go to Cart
          </Link>
        ) : null}

        <p className="mt-2 text-[10px] leading-snug text-stone-500">GST included · Shipping at checkout</p>
      </div>

      {isRail ? (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <ul>
            {items.map((line) => (
              <CompactLine key={line.variantId} line={line} busy={busy} onQty={setQty} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
