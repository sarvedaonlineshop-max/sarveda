"use client";

import { type Zone, unitMrpMinor, unitSaleMinor, zoneToCurrency } from "@/lib/currency";
import { discountPercentOff, formatMinorFromPaise, savingsInPaise } from "@/lib/money";
import type { ProductVariantDetail } from "@/lib/types";
import { salePriceRange } from "@/lib/variant-utils";

type Props = {
  variant: ProductVariantDetail | null;
  variants: ProductVariantDetail[];
  zone: Zone;
  size?: "default" | "compact";
};

export function PriceDisplay({ variant, variants, zone, size = "default" }: Props) {
  const currency = zoneToCurrency(zone);
  const isCompact = size === "compact";

  if (!variant && variants.length > 1) {
    const range = salePriceRange(variants, (v) => unitSaleMinor(v, zone));
    if (!range) return null;
    const fromLabel =
      range.min === range.max
        ? formatMinorFromPaise(range.min, currency)
        : `${formatMinorFromPaise(range.min, currency)} – ${formatMinorFromPaise(range.max, currency)}`;
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">From</p>
        <p
          className={
            isCompact
              ? "text-lg font-bold tracking-tight text-stone-900"
              : "text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
          }
        >
          {fromLabel}
        </p>
        <p className="text-xs text-stone-500">Select options to see exact price</p>
      </div>
    );
  }

  if (!variant) return null;

  const sale = unitSaleMinor(variant, zone);
  const mrp = unitMrpMinor(variant, zone);
  const discountPercent = discountPercentOff(mrp, sale);
  const savings = savingsInPaise(mrp, sale);

  return (
    <div className="space-y-2">
      {discountPercent ? (
        <span className="inline-flex rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
          {discountPercent}% off
        </span>
      ) : null}
      <p
        className={
          isCompact
            ? "text-lg font-bold tracking-tight text-stone-900"
            : "text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
        }
      >
        {formatMinorFromPaise(sale, currency)}
      </p>
      {mrp > sale ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
          <span className="line-through">M.R.P. {formatMinorFromPaise(mrp, currency)}</span>
          {savings > 0 ? (
            <span className="font-medium text-emerald-700">Save {formatMinorFromPaise(savings, currency)}</span>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-stone-500">
        {zone === "IN" ? "Inclusive of all taxes" : `Price in ${currency}`}
        {variant.sku ? (
          <>
            {" "}
            · <span className="text-stone-400">SKU {variant.sku}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
