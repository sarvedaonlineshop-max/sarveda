"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { usePricingZone } from "@/hooks/usePricingZone";
import {
  unitMrpMinor,
  unitSaleMinor,
  zoneToCurrency,
  type VariantPriceFields,
  type Zone
} from "@/lib/currency";
import { discountPercentOff, formatMinorFromPaise } from "@/lib/money";
import { blockProductImageContextMenu, productImageClassName } from "@/lib/product-image-guard";
import { productListBadges } from "@/lib/product-badges";
import { saveShopScroll } from "@/lib/shop-scroll-restore";
import type { ProductListItem } from "@/lib/types";

type Props = {
  product: ProductListItem;
  layout?: "grid" | "rail";
  revealOnView?: boolean;
  revealDelayMs?: number;
};

const HOVER_INTERVAL_MS = 1200;

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

function cardImageUrls(product: ProductListItem): string[] {
  const fromList = product.imageUrls?.filter(Boolean) ?? [];
  if (fromList.length > 0) return fromList.slice(0, 4);
  return product.primaryImageUrl ? [product.primaryImageUrl] : [];
}

export function ProductCard({
  product,
  layout = "grid",
  revealOnView = false,
  revealDelayMs = 0
}: Props) {
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
  const revealRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!revealOnView);
  const images = useMemo(() => cardImageUrls(product), [product]);
  const [hoverIndex, setHoverIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const hoverTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!revealOnView) return;
    const el = revealRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [revealOnView]);

  useEffect(() => {
    if (!hovering || images.length <= 1) {
      window.clearInterval(hoverTimerRef.current);
      return;
    }
    hoverTimerRef.current = window.setInterval(() => {
      setHoverIndex((current) => (current + 1) % images.length);
    }, HOVER_INTERVAL_MS);
    return () => window.clearInterval(hoverTimerRef.current);
  }, [hovering, images.length]);

  useEffect(() => {
    if (!hovering) setHoverIndex(0);
  }, [hovering]);

  const activeImage = images[hoverIndex] ?? images[0] ?? null;

  const card = (
    <article
      className={`group relative flex h-full flex-col overflow-hidden bg-brand-ivory transition-all duration-300 ${
        rail
          ? "w-[72vw] max-w-[18rem] rounded-3xl border border-brand-cream-dark shadow-card hover:-translate-y-1 hover:scale-[1.01] hover:shadow-card-hover"
          : "rounded-xl border border-brand-cream-dark shadow-card hover:-translate-y-1 hover:scale-[1.01] hover:shadow-card-hover active:-translate-y-0.5 active:shadow-card-hover focus-within:-translate-y-1 focus-within:shadow-card-hover md:rounded-3xl"
      }`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Link
        href={href}
        onClick={() => saveShopScroll(product.slug)}
        className="flex min-h-0 flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2"
      >
        <div
          className="relative aspect-square overflow-hidden bg-brand-cream-dark/40"
          onContextMenu={blockProductImageContextMenu}
        >
          {activeImage ? (
            <Image
              src={activeImage}
              alt={product.name}
              fill
              className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] ${productImageClassName}`}
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
        </div>

        <div className="flex flex-1 flex-col gap-1.5 bg-[#166D46] p-2.5 md:gap-2 md:p-3">
          {primaryCat ? (
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75 md:text-[10px]">
              {primaryCat.name}
            </p>
          ) : null}

          <h2 className="line-clamp-2 font-sans text-[0.9375rem] font-semibold leading-snug text-white transition-colors group-hover:text-white/90 md:text-[1rem]">
            {product.name}
          </h2>

          <div className="mt-auto flex flex-wrap items-baseline gap-1.5 pt-1">
            {priceLabel ? (
              <p className="font-sans text-sm font-semibold tabular-nums tracking-tight text-white md:text-base">
                {priceLabel}
              </p>
            ) : null}
            {mrpMinor != null && saleMinor != null && mrpMinor > saleMinor ? (
              <p className="font-sans text-xs tabular-nums text-white/55 line-through">
                {formatMinorFromPaise(mrpMinor, currency)}
              </p>
            ) : null}
          </div>

          <span className="mt-1.5 inline-flex w-fit items-center rounded-full bg-gradient-to-b from-[#d4a84a] to-brand-gold px-3 py-1 text-[11px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)_inset,0_2px_8px_rgba(28,53,42,0.2)] transition-[transform,box-shadow] group-hover:-translate-y-0.5 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.28)_inset,0_4px_12px_rgba(28,53,42,0.28)]">
            View product
          </span>
        </div>
      </Link>
    </article>
  );

  if (!revealOnView) return card;

  return (
    <div
      ref={revealRef}
      className={`shop-card-reveal h-full ${visible ? "is-visible" : ""}`}
      style={{ transitionDelay: `${revealDelayMs}ms` }}
    >
      {card}
    </div>
  );
}
