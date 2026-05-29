"use client";

import { useEffect, useMemo, useState } from "react";

import { AccordionDescription } from "@/components/product/AccordionDescription";
import { PairWithRow } from "@/components/product/PairWithRow";
import { ProductAudio } from "@/components/product/ProductAudio";
import { ProductBuyBox } from "@/components/product/ProductBuyBox";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { ProductRichText } from "@/components/product/ProductRichText";
import { cartAdd } from "@/lib/cart-api";
import { readZoneFromCookie, unitSaleMinor, zoneToCurrency, type Zone } from "@/lib/currency";
import { resolveMediaUrl } from "@/lib/media-cdn";
import { formatMinorFromPaise } from "@/lib/money";
import { imageIndexForVariant } from "@/lib/variant-image";
import { availableStock, stockDisplay, variantDisplayLabel } from "@/lib/variant-utils";
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
 * Amazon-style PDP (main branch):
 * - Left: sticky gallery (+ audio)
 * - Center: title, copy, pair-with, about + accordion (page scroll)
 * - Right: sticky buy box (desktop)
 */
export function ProductDetailExperience({ product, pairWithItems }: Props) {
  const initial = useMemo(() => pickInitialVariant(product.variants), [product.variants]);
  const [variantId, setVariantId] = useState<string | null>(initial?.id ?? null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [zone, setZone] = useState<Zone>("IN");
  const [addedFlash, setAddedFlash] = useState(false);

  useEffect(() => {
    setZone(readZoneFromCookie());
  }, []);

  const variant = product.variants.find((v) => v.id === variantId) ?? initial;
  const isDigital = product.productType === "DIGITAL";
  const currency = zoneToCurrency(zone);

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
    available != null && available > 0 && available < 999 ? Math.min(available, 10) : 10;

  const add = () => {
    if (!variant || qty < 1) return;
    void (async () => {
      try {
        await cartAdd(variant.id, qty);
        setAddedFlash(true);
        window.setTimeout(() => setAddedFlash(false), 2200);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Could not add to cart");
      }
    })();
  };

  const categoryTags = product.categories.map((c) => c.category.name).slice(0, 3);

  const buyBoxProps = {
    variant,
    variants: product.variants,
    onVariantChange: setVariantId,
    zone,
    saleMinor,
    qty,
    onQtyChange: setQty,
    maxQty,
    addDisabled,
    addedFlash,
    onAdd: add,
    isDigital,
    shippingDays,
    available,
    variantForStock: variant
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-10 lg:pb-12">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-x-8 xl:gap-x-10">
          {/* Left: sticky gallery */}
          <div className={`lg:col-span-5 xl:col-span-5 lg:sticky ${STICKY_TOP} lg:self-start`}>
            <ProductGallery
              images={sortedImages}
              productName={product.name}
              activeIndex={galleryIndex}
              onActiveChange={setGalleryIndex}
            />

            {product.hasAudio && audioUrl ? (
              <div className="mt-5">
                <ProductAudio audioUrl={audioUrl} title={variantLabel} variant="storefront" />
              </div>
            ) : null}

            {categoryTags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {categoryTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Center: product story + long copy (scrolls with page) */}
          <div className="min-w-0 space-y-8 lg:col-span-4 xl:col-span-4">
            <div>
              <h1 className="font-serif text-2xl font-semibold leading-tight text-stone-900 sm:text-[1.75rem] lg:text-[2rem]">
                {product.name}
              </h1>

              <div className="mt-2 flex items-center gap-1 text-sm text-stone-500" aria-label="No reviews yet">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className="h-4 w-4 text-stone-300" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
                <span className="ml-1">0 out of 0 reviews</span>
              </div>

              {codAvailable ? (
                <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-md border border-[#108967] px-3 py-2 text-sm text-[#108967]">
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

              {product.shortDescription ? (
                <ProductRichText
                  html={product.shortDescription}
                  className="mt-4 text-sm leading-relaxed text-stone-600"
                />
              ) : null}
            </div>

            {/* Mobile: options + delivery (Add to cart is on sticky bar) */}
            <div className="lg:hidden">
              <ProductBuyBox {...buyBoxProps} showPurchaseActions={false} />
            </div>

            <PairWithRow items={pairWithItems.slice(0, 3)} />

            {product.description ? (
              <section className="border-t border-stone-200 pt-8">
                <h2 className="font-serif text-xl font-semibold text-stone-900">About this product</h2>
                <ProductRichText html={product.description} className="mt-4 max-w-none prose-stone" />
              </section>
            ) : null}

            {product.accordionItems.length > 0 ? (
              <section className="border-t border-stone-200 pt-8">
                <h2 className="font-serif text-xl font-semibold text-stone-900">Product details</h2>
                <div className="mt-4">
                  <AccordionDescription items={product.accordionItems} />
                </div>
              </section>
            ) : null}
          </div>

          {/* Right: sticky buy box (desktop) */}
          <aside className="hidden lg:col-span-3 lg:block xl:col-span-3">
            <div className={`sticky ${STICKY_TOP}`}>
              <ProductBuyBox {...buyBoxProps} showPurchaseActions />
            </div>
          </aside>
        </div>

        <div className="mt-12 border-t border-stone-200 pt-10">
          <ProductReviewsSection />
        </div>
      </div>

      {/* Mobile sticky purchase bar */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md safe-area-pb lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">{product.name}</p>
            <p className="text-lg font-bold tracking-tight text-[#b85c38]">
              {variant ? formatMinorFromPaise(saleMinor, currency) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={add}
            disabled={addDisabled}
            className="min-h-[48px] flex-1 rounded-md bg-[#108967] px-4 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#0d7353] disabled:bg-stone-300"
          >
            {addedFlash ? "Added ✓" : addDisabled ? "Out of stock" : "Add to cart"}
          </button>
        </div>
      </div>
    </>
  );
}
