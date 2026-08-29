"use client";

import Image from "next/image";
import Link from "next/link";

import { CartLineQuantity } from "@/components/cart/CartLineQuantity";
import type { CartApiItem } from "@/lib/cart-api";
import { formatMinorFromPaise } from "@/lib/money";

import { useCartData } from "./CartProvider";

type Props = {
  mode: "pdp-rail" | "cart-page";
  className?: string;
};

function CompactLine({ line, currency }: { line: CartApiItem; currency: string }) {
  return (
    <li className="border-b border-stone-100 py-2.5 last:border-0">
      <p className="font-sans text-sm font-semibold tabular-nums leading-tight text-brand-forest">
        {formatMinorFromPaise(line.unitPriceInPaise, currency)}
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
          <p className="line-clamp-2 font-sans text-[12px] font-medium leading-snug text-brand-ink">{line.productName}</p>
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
      <div className={`${isRail ? "border-b border-brand-cream-dark bg-white px-3 py-3" : "rounded-2xl border border-brand-cream-dark bg-brand-cream p-5 shadow-card"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
          Subtotal ({count} {count === 1 ? "item" : "items"})
        </p>
        <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight text-brand-ink">
          {formatMinorFromPaise(subtotalInPaise, currency)}
        </p>

        <Link
          href="/checkout"
          className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-full bg-brand-gold text-sm font-semibold text-brand-night shadow-sm transition-colors hover:bg-[#a37934]"
        >
          Proceed to Buy
        </Link>

        {isRail ? (
          <Link
            href="/cart"
            className="mt-2 flex min-h-[36px] w-full items-center justify-center rounded-full border border-brand-forest/25 bg-white text-xs font-medium text-brand-forest hover:bg-brand-forest/5"
          >
            Go to Cart
          </Link>
        ) : null}

        <p className="mt-2 text-[10px] leading-snug text-brand-muted">
          {currency === "INR" ? "GST included · Shipping at checkout" : "Taxes included · Shipping at checkout"}
        </p>
      </div>

      {isRail ? (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <ul>
            {items.map((line) => (
              <CompactLine key={line.variantId} line={line} currency={currency} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
