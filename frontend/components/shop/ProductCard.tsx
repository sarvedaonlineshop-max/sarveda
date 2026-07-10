"use client";

import Image from "next/image";
import Link from "next/link";

import { usePricingZone } from "@/hooks/usePricingZone";
import {
  unitMrpMinor,
  unitSaleMinor,
  zoneToCurrency,
  type VariantPriceFields,
  type Zone
} from "@/lib/currency";
import { discountPercentOff, formatMinorFromPaise } from "@/lib/money";
import { productListBadges } from "@/lib/product-badges";
import type { ProductListItem } from "@/lib/types";

type Props = {
  product: ProductListItem;
  layout?: "grid" | "rail";
};

function listItemAsVariantPrice(product: ProductListItem): VariantPriceFields | null {
  if (product.fromPriceInPaise == null) return null;
  return {
    saleInPaise: product.fromPriceInPaise,
    mrpInPaise: product.fromMrpInPaise ?? product.fromPriceInPaise,
    saleUsdCents: product.fromSaleUsdCents,
    mrpUsdCents: product.fromMrpUsdCents,
    saleGbpPence: product.fromSaleGbpPence,
    mrpGbpPence: product.fromMrpGbpPence
  };
}

function formatListPrice(product: ProductListItem, zone: Zone): string | null {
  const fields = listItemAsVariantPrice(product);
  if (!fields) return null;
  const minor = unitSaleMinor(fields, zone);
  return formatMinorFromPaise(minor, zoneToCurrency(zone));
}

export function ProductCard({ product, layout = "grid" }: Props) {
  const zone = usePricingZone();
  const priceLabel = formatListPrice(product, zone);
  const fields = listItemAsVariantPrice(product);
  const saleMinor = fields ? unitSaleMinor(fields, zone) : null;
  const mrpMinor = fields ? unitMrpMinor(fields, zone) : null;
  const discountPercent =
    saleMinor != null && mrpMinor != null && mrpMinor > saleMinor
      ? discountPercentOff(mrpMinor, saleMinor)
      : null;
  const href = `/product/${product.slug}`;
  const badges = productListBadges(product);
  const primaryCat = product.categories[0];
  const rail = layout === "rail";
  const currency = zoneToCurrency(zone);

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden bg-brand-ivory transition-all duration-300 ${
        rail
          ? "w-[72vw] max-w-[18rem] rounded-3xl border border-brand-cream-dark shadow-card hover:-translate-y-1 hover:scale-[1.01] hover:shadow-card-hover"
          : "rounded-none border-b border-brand-cream-dark md:rounded-3xl md:border md:border-brand-cream-dark md:shadow-card md:hover:-translate-y-1 md:hover:scale-[1.01] md:hover:shadow-card-hover"
      }`}
    >
      <Link href={href} className="flex min-h-0 flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2">
        <div className="relative aspect-square overflow-hidden bg-brand-cream-dark">
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              sizes={rail ? "72vw" : "(max-width:768px) 50vw,(max-width:1024px) 50vw,33vw"}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-brand-muted">No image</div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <div className="pointer-events-none absolute left-2.5 top-2.5 flex max-w-[calc(100%-1.25rem)] flex-col gap-1">
            {discountPercent ? (
              <span className="inline-flex w-fit rounded-full bg-brand-forest px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-brand-cream">
                Save {discountPercent}%
              </span>
            ) : null}
            {badges.slice(0, 2).map((badge) => (
              <span
                key={badge.key}
                className="inline-flex w-fit rounded-full border border-brand-gold/30 bg-brand-gold/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold"
              >
                {badge.label}
              </span>
            ))}
          </div>

          {product.hasAudio ? (
            <span
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-sm shadow-md"
              style={{ background: "rgba(255,253,247,0.95)", backdropFilter: "blur(4px)" }}
              title="Includes audio sample"
            >
              🎵
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 md:gap-2 md:p-4">
          {primaryCat ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold md:text-[11px]">
              {primaryCat.name}
            </p>
          ) : null}

          <h2 className="line-clamp-2 font-serif text-sm font-medium leading-snug text-brand-ink transition-colors group-hover:text-brand-forest md:text-base">
            {product.name}
          </h2>

          <div className="mt-auto flex flex-wrap items-baseline gap-2 pt-2">
            {priceLabel ? (
              <p className="text-base font-bold text-brand-forest md:text-lg">{priceLabel}</p>
            ) : null}
            {mrpMinor != null && saleMinor != null && mrpMinor > saleMinor ? (
              <p className="text-xs text-brand-muted line-through md:text-sm">
                {formatMinorFromPaise(mrpMinor, currency)}
              </p>
            ) : null}
          </div>

          <span className="mt-3 inline-flex w-fit items-center rounded-full bg-brand-forest px-4 py-2 text-xs font-semibold text-brand-cream transition-colors group-hover:bg-brand-night">
            View product
          </span>
        </div>
      </Link>
    </article>
  );
}
