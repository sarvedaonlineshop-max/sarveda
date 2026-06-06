"use client";

import Image from "next/image";
import Link from "next/link";

import { CartLineQuantity } from "@/components/cart/CartLineQuantity";
import type { CartApiItem } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

import { FreeShippingBar } from "./FreeShippingBar";
import { useCartData } from "./CartProvider";

type Props = {
  mode: "pdp-rail" | "cart-page";
  className?: string;
};

function CompactLine({ line }: { line: CartApiItem }) {
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
          <div className="mt-1.5">
            <CartLineQuantity line={line} size="sm" showDeleteAtOne />
          </div>
        </div>
      </div>
    </li>
  );
}

export function CartCheckoutSidebar({ mode, className = "" }: Props) {
  const { items, subtotalInPaise, itemCount, currency } = useCartData();

  const count = itemCount > 0 ? itemCount : items.reduce((n, i) => n + i.quantity, 0);
  if (count === 0 && items.length === 0) return null;

  const isRail = mode === "pdp-rail";

  return (
    <div className={className}>
      <div className={`border-stone-200 bg-white ${isRail ? "border-b px-3 py-3" : "rounded-lg border p-4 shadow-sm"}`}>
        <p className="text-[11px] text-stone-600">
          Subtotal ({count} {count === 1 ? "item" : "items"}):
        </p>
        <p className="mt-0.5 text-lg font-semibold text-stone-900">{formatINRFromPaise(subtotalInPaise)}</p>

        <FreeShippingBar subtotalInPaise={subtotalInPaise} currency={currency} />

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
              <CompactLine key={line.variantId} line={line} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
