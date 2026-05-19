"use client";

import Link from "next/link";

import { DeliveryTimeline } from "@/components/product/DeliveryTimeline";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import type { Zone } from "@/lib/currency";
import type { ProductVariantDetail } from "@/lib/types";

type Props = {
  variant: ProductVariantDetail | null;
  variants: ProductVariantDetail[];
  zone: Zone;
  saleMinor: number;
  qty: number;
  onQtyChange: (qty: number) => void;
  maxQty: number;
  addDisabled: boolean;
  addedFlash: boolean;
  onAdd: () => void;
  isDigital: boolean;
  shippingDays: string;
  available: number | null;
};

export function ProductBuyBox({
  variant,
  variants,
  zone,
  saleMinor,
  qty,
  onQtyChange,
  maxQty,
  addDisabled,
  addedFlash,
  onAdd,
  isDigital,
  shippingDays,
  available
}: Props) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-5 shadow-sm">
      <PriceDisplay variant={variant} variants={variants} zone={zone} presentation="storefront" size="compact" />

      {!isDigital ? (
        <div className="mt-4">
          <DeliveryTimeline shippingDays={shippingDays} />
        </div>
      ) : null}

      {available !== null ? (
        <p className="mt-3 text-sm text-stone-600">
          {available > 0 ? (
            <>
              <span className="font-semibold text-[#108967]">In stock</span>
              {available <= 5 ? (
                <span className="text-amber-800"> — only {available} left</span>
              ) : null}
            </>
          ) : (
            <span className="font-semibold text-amber-800">Out of stock</span>
          )}
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="pdp-qty" className="mb-2 block text-sm font-medium text-stone-700">
          Quantity:
        </label>
        <select
          id="pdp-qty"
          value={qty}
          onChange={(e) => onQtyChange(Number(e.target.value))}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-[#108967] focus:outline-none focus:ring-1 focus:ring-[#108967]"
        >
          {Array.from({ length: Math.min(maxQty, 10) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={addDisabled}
        className="mt-4 w-full rounded-lg bg-[#108967] py-3.5 text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#0d7353] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
      >
        {addDisabled ? "Out of stock" : "Add to cart"}
      </button>

      <Link
        href="/cart"
        className="mt-2 flex w-full items-center justify-center rounded-lg border border-stone-300 bg-white py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
      >
        Go to cart
      </Link>

      {addedFlash ? (
        <p className="mt-2 text-center text-sm font-medium text-emerald-600" role="status">
          Added to cart
        </p>
      ) : null}

      {variant ? (
        <p className="mt-4 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">
          Secure checkout
        </p>
      ) : null}
    </div>
  );
}
