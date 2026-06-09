"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { AccordionDescription } from "@/components/product/AccordionDescription";
import { PairWithRow } from "@/components/product/PairWithRow";
import { ProductAudio } from "@/components/product/ProductAudio";
import { ProductBuyBox } from "@/components/product/ProductBuyBox";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { ProductRichText } from "@/components/product/ProductRichText";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import { fetchProductBySlug } from "@/lib/api";
import { cartAdd } from "@/lib/cart-api";
import { usePricingZone } from "@/hooks/usePricingZone";
import { unitSaleMinor, zoneToCurrency } from "@/lib/currency";
import { resolveMediaUrl } from "@/lib/media-cdn";
import { formatINRFromPaise, formatMinorFromPaise } from "@/lib/money";
import { imageIndexForVariant } from "@/lib/variant-image";
import {
  availableStock,
  stockDisplay,
  UNTRACKED_STOCK_ON_HAND,
  variantDisplayLabel
} from "@/lib/variant-utils";
import type { ProductDetail, ProductListItem } from "@/lib/types";

function pickInitialVariant(variants: ProductDetail["variants"]) {
  if (!variants.length) return null;
  return variants.find((v) => v.isDefault) ?? variants[0];
}

type Props = {
  product: ProductDetail;
  pairWithItems: ProductListItem[];
};

const STICKY_TOP = "top-24 lg:top-28";

/**
 * Two-column PDP (Auroville-style) + Amazon fixed cart rail on desktop when cart has items.
 * - Col 1: sticky gallery until the buy/details block is scrolled through
 * - Col 2: title → price → buy box → full description → accordion
 * - Below: pair-with, reviews
 */
export function ProductDetailExperience({ product, pairWithItems }: Props) {
  const router = useRouter();
  const { items, itemCount, subtotalInPaise } = useCartData();
  const hasCartRail = itemCount > 0 || items.length > 0;
  const cartCount = itemCount > 0 ? itemCount : items.reduce((n, i) => n + i.quantity, 0);

  const [variants, setVariants] = useState(product.variants);
  const initial = useMemo(() => pickInitialVariant(variants), [variants]);
  const [variantId, setVariantId] = useState<string | null>(initial?.id ?? null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const zone = usePricingZone();
  const [addedFlash, setAddedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProductBySlug(product.slug, { cache: "no-store" }).then((fresh) => {
      if (!cancelled && fresh?.variants?.length) {
        setVariants(fresh.variants);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [product.slug]);

  useEffect(() => {
    if (!variants.length) return;
    const stillValid = variants.some((v) => v.id === variantId);
    if (!stillValid) {
      const next = pickInitialVariant(variants);
      setVariantId(next?.id ?? null);
    }
  }, [variants, variantId]);

  const variant = variants.find((v) => v.id === variantId) ?? initial;
  const isDigital = product.productType === "DIGITAL";
  const currency = zoneToCurrency(zone);
  const primaryCategory = product.categories[0]?.category;

  const hasMeaningfulHtml = (html: string | null | undefined) => {
    const raw = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return raw.length > 0;
  };

  const accordionItems = useMemo(
    () => product.accordionItems.filter((item) => hasMeaningfulHtml(item.content)),
    [product.accordionItems]
  );

  const sortedImages = useMemo(
    () => [...product.images].sort((a, b) => a.position - b.position),
    [product.images]
  );

  useEffect(() => {
    if (!variant || !sortedImages.length) return;
    setGalleryIndex(imageIndexForVariant(variant, sortedImages));
  }, [variant, sortedImages]);

  const audioUrl = resolveMediaUrl(product.audioUrl);
  const variantLabel = variant ? variantDisplayLabel(variant, 0) : product.name;

  const inRate = variant?.shippingRates?.find((r) => r.country === "IN");
  const shippingDays = inRate?.estimatedDays?.trim() || "4 - 7 Days";
  const codAvailable =
    zone === "IN" && !isDigital && (inRate?.codPerProduct != null || inRate?.codAdditional != null);

  const available = variant ? availableStock(variant) : null;
  const stockInfo = variant ? stockDisplay(variant) : null;
  const addDisabled = !variant || !stockInfo?.inStock;
  const saleMinor = variant ? unitSaleMinor(variant, zone) : 0;
  const maxQty =
    available != null && available > 0 && available < UNTRACKED_STOCK_ON_HAND
      ? available
      : UNTRACKED_STOCK_ON_HAND;

  useEffect(() => {
    setQty((current) => Math.min(Math.max(1, current), maxQty));
  }, [variantId, maxQty]);

  const add = async () => {
    if (!variant || qty < 1) return;
    try {
      await cartAdd(variant.id, qty);
      setAddedFlash(true);
      window.setTimeout(() => setAddedFlash(false), 2200);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not add to cart");
    }
  };

  const buyNow = async () => {
    if (!variant || qty < 1 || addDisabled) return;
    try {
      await cartAdd(variant.id, qty);
      router.push("/checkout");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not continue to checkout");
    }
  };

  const buyBoxProps = {
    variant,
    variants,
    onVariantChange: setVariantId,
    zone,
    saleMinor,
    qty,
    onQtyChange: setQty,
    maxQty,
    addDisabled,
    addedFlash,
    onAdd: () => void add(),
    onBuyNow: () => void buyNow(),
    isDigital,
    shippingDays,
    available,
    variantForStock: variant,
    layout: "inline" as const,
    showPurchaseActions: true
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-6 pb-32 sm:px-6 lg:px-8 lg:py-10 lg:pb-12">
        {/* Primary two-column block — left column sticks while right column scrolls */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-x-10 xl:gap-x-14">
          <div className={`lg:sticky ${STICKY_TOP} lg:self-start`}>
            <ProductGallery
              images={sortedImages}
              productName={product.name}
              activeIndex={galleryIndex}
              onActiveChange={setGalleryIndex}
              enableZoom
            />

            {product.hasAudio && audioUrl ? (
              <div className="mt-5">
                <ProductAudio audioUrl={audioUrl} variant="storefront" />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-6">
            {primaryCategory ? (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c45a2a]">
                {primaryCategory.name}
              </p>
            ) : null}

            <h1 className="font-serif text-2xl font-semibold leading-tight text-stone-900 sm:text-3xl lg:text-[2rem]">
              {product.name}
            </h1>

            <div className="flex items-center gap-1 text-sm text-stone-500" aria-label="No reviews yet">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className="h-4 w-4 text-stone-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="ml-1">0 out of 0 reviews</span>
            </div>

            <div>
              <PriceDisplay variant={variant} variants={product.variants} zone={zone} presentation="storefront" />
              <p className="mt-1 text-xs text-stone-500">Taxes included. Shipping calculated at checkout.</p>
            </div>

            {codAvailable ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-md border border-[#108967] px-3 py-2 text-sm text-[#108967]">
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m0 0H21m-1.5 0h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5 0H21"
                  />
                </svg>
                Cash On Delivery Available
              </div>
            ) : null}

            <ProductBuyBox {...buyBoxProps} />

            {product.description ? (
              <div className="border-t border-stone-200 pt-8">
                <ProductRichText html={product.description} className="max-w-none text-sm leading-relaxed text-stone-700 prose-stone" />
              </div>
            ) : null}

            {product.shortDescription && !product.description ? (
              <ProductRichText html={product.shortDescription} className="text-sm leading-relaxed text-stone-600" />
            ) : null}

            {accordionItems.length > 0 ? (
              <div className="border-t border-stone-200 pt-8">
                <h2 className="font-serif text-lg font-semibold text-stone-900">Product details</h2>
                <div className="mt-4">
                  <AccordionDescription items={accordionItems} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-14 space-y-14 border-t border-stone-200 pt-12">
          <PairWithRow items={pairWithItems.slice(0, 3)} />
          <ProductReviewsSection productId={product.id} />
        </div>
      </div>

      {/* Mobile / tablet sticky purchase bar (desktop uses fixed cart rail at lg+) */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-50 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md safe-area-pb lg:hidden">
        {hasCartRail ? (
          <Link
            href="/checkout"
            className="mx-auto mb-3 flex min-h-[44px] w-full max-w-lg items-center justify-center rounded-lg bg-[#ffd814] text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-[#f7ca00]"
          >
            Proceed to Buy · {formatINRFromPaise(subtotalInPaise)}
            {cartCount > 0 ? ` (${cartCount})` : ""}
          </Link>
        ) : null}
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">{product.name}</p>
            <p className="text-lg font-bold tracking-tight text-[#b85c38]">
              {variant ? formatMinorFromPaise(saleMinor, currency) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={addDisabled}
            className="min-h-[44px] rounded-full border border-stone-900 bg-white px-4 text-xs font-semibold uppercase text-stone-900"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => void buyNow()}
            disabled={addDisabled}
            className="min-h-[44px] flex-1 rounded-full bg-[#c45a2a] px-4 text-xs font-semibold uppercase text-white"
          >
            Buy now
          </button>
        </div>
      </div>
    </>
  );
}
