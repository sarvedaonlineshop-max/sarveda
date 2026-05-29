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
  /** Matches live sarveda.com: terra sale price, struck MRP */
  presentation?: "default" | "storefront";
};

export function PriceDisplay({
  variant,
  variants,
  zone,
  size = "default",
  presentation = "default"
}: Props) {
  const currency = zoneToCurrency(zone);
  const isCompact = size === "compact";
  const isStorefront = presentation === "storefront";
  const saleClass = isStorefront
    ? "price-text text-2xl font-bold text-[#b85c38] sm:text-3xl"
    : isCompact
      ? "price-text text-lg font-bold tracking-tight text-brand-ink"
      : "price-text text-3xl font-semibold tracking-tight text-brand-ink sm:text-4xl";

  if (!variant && variants.length > 1) {
    const range = salePriceRange(variants, (v) => unitSaleMinor(v, zone));
    if (!range) return null;
    const fromLabel =
      range.min === range.max
        ? formatMinorFromPaise(range.min, currency)
        : `${formatMinorFromPaise(range.min, currency)} – ${formatMinorFromPaise(range.max, currency)}`;
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-muted">From</p>
        <p className={saleClass}>{fromLabel}</p>
        <p className="text-xs text-brand-muted">Select options to see exact price</p>
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
      {discountPercent && !isStorefront ? (
        <span className="inline-flex rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
          {discountPercent}% off
        </span>
      ) : null}
      <div className={isStorefront ? "flex flex-wrap items-baseline gap-3" : undefined}>
        {mrp > sale && isStorefront ? (
          <span className="price-text text-lg text-brand-muted line-through">
            {formatMinorFromPaise(mrp, currency)}
          </span>
        ) : null}
        <p className={saleClass}>{formatMinorFromPaise(sale, currency)}</p>
      </div>
      {mrp > sale && !isStorefront ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span className="line-through">M.R.P. {formatMinorFromPaise(mrp, currency)}</span>
          {savings > 0 ? (
            <span className="price-text font-medium text-brand-sage">Save {formatMinorFromPaise(savings, currency)}</span>
          ) : null}
        </div>
      ) : null}
      {!isStorefront ? (
        <p className="text-xs text-brand-muted">
          {zone === "IN" ? "Inclusive of all taxes" : `Price in ${currency}`}
          {variant.sku ? (
            <>
              {" "}
              · <span className="text-brand-muted">SKU {variant.sku}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
