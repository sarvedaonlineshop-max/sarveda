"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useCartData } from "@/components/cart/CartProvider";
import { AccordionDescription } from "@/components/product/AccordionDescription";
import { NotifyMeButton } from "@/components/product/NotifyMeButton";
import { ProductAudio } from "@/components/product/ProductAudio";
import { ProductBuyBox } from "@/components/product/ProductBuyBox";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductOffersBanner } from "@/components/product/ProductOffersBanner";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { ProductRichText } from "@/components/product/ProductRichText";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import { fetchProductBySlug, getApiBase } from "@/lib/api";
import { cartAdd } from "@/lib/cart-api";
import { usePricingZone } from "@/hooks/usePricingZone";
import { unitSaleMinor, zoneToCurrency } from "@/lib/currency";
import { resolveMediaUrl } from "@/lib/media-cdn";
import { formatINRFromPaise, formatMinorFromPaise } from "@/lib/money";
import {
  galleryImagesForVariant,
  imageIndexForVariant,
  resolveVariantAudioUrl,
  resolveVariantVideoUrl
} from "@/lib/variant-gallery";
import { galleryHasVideoItems } from "@/lib/gallery-media";
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

const STICKY_TOP = "top-[var(--storefront-header-offset)]";

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

  const [catalog, setCatalog] = useState(product);
  const [variants, setVariants] = useState(product.variants);
  const initial = useMemo(() => pickInitialVariant(variants), [variants]);
  const [variantId, setVariantId] = useState<string | null>(initial?.id ?? null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const zone = usePricingZone();
  const [addedFlash, setAddedFlash] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<{ total: number; average: number } | null>(null);
  const [mediaFading, setMediaFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${getApiBase()}/api/reviews/${product.id}`)
      .then((res) => res.json())
      .then((data: { total?: number; average?: number }) => {
        if (!cancelled) {
          setReviewSummary({ total: data.total ?? 0, average: data.average ?? 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setReviewSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  useEffect(() => {
    setCatalog(product);
    setVariants(product.variants);
  }, [product]);

  useEffect(() => {
    let cancelled = false;
    void fetchProductBySlug(product.slug, { cache: "no-store" }).then((fresh) => {
      if (!cancelled && fresh?.variants?.length) {
        setCatalog(fresh);
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

  const hasMeaningfulHtml = (html: string | null | undefined) => {
    const raw = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return raw.length > 0;
  };

  const accordionItems = useMemo(
    () => product.accordionItems.filter((item) => hasMeaningfulHtml(item.content)),
    [product.accordionItems]
  );

  const sortedImages = useMemo(() => {
    const all = [...catalog.images].sort((a, b) => a.position - b.position);
    if (!variant) return all;
    return galleryImagesForVariant(variant.id, all);
  }, [catalog.images, variant]);

  const activeVideoUrl = useMemo(
    () => (galleryHasVideoItems(sortedImages) ? null : resolveVariantVideoUrl(variant, product)),
    [variant, product, sortedImages]
  );

  useEffect(() => {
    if (!variant || !sortedImages.length) return;
    setGalleryIndex(imageIndexForVariant(variant, sortedImages));
  }, [variant, sortedImages]);

  const audioUrl = resolveMediaUrl(resolveVariantAudioUrl(variant, product));
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

  const handleVariantChange = (nextId: string) => {
    if (nextId === variantId) return;
    setMediaFading(true);
    window.setTimeout(() => {
      setVariantId(nextId);
      window.setTimeout(() => setMediaFading(false), 90);
    }, 160);
  };

  const buyBoxProps = {
    variant,
    variants,
    onVariantChange: handleVariantChange,
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
    showPurchaseActions: true,
    expressShippingEnabled: product.expressShippingEnabled !== false,
    axisOrder: product.variantAxisOrder,
    pairWithItems
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6 lg:px-8 lg:py-14 lg:pb-16">
        {/* Primary two-column block — left column sticks while right column scrolls */}
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16">
          <div
            className={`lg:sticky ${STICKY_TOP} lg:self-start transition-opacity duration-200 ease-out ${
              mediaFading ? "opacity-25" : "opacity-100"
            }`}
          >
            <ProductGallery
              images={sortedImages}
              productName={product.name}
              activeIndex={galleryIndex}
              onActiveChange={setGalleryIndex}
              enableZoom
              videoUrl={activeVideoUrl}
            />

            {audioUrl ? (
              <div className="mt-5">
                <ProductAudio
                  key={audioUrl}
                  audioUrl={audioUrl}
                  productName={variantLabel || product.name}
                  variant="storefront"
                />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-6">
            <div>
              <h1 className="font-sans text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
                {product.name}
              </h1>
            </div>

            <div
              className="flex items-center gap-1 text-sm text-brand-muted"
              aria-label={
                reviewSummary && reviewSummary.total > 0
                  ? `Rated ${reviewSummary.average.toFixed(1)} out of 5 from ${reviewSummary.total} reviews`
                  : "No reviews yet"
              }
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <svg
                  key={i}
                  className={`h-4 w-4 ${
                    reviewSummary && i < Math.round(reviewSummary.average)
                      ? "text-brand-gold"
                      : "text-brand-cream-dark"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="ml-1 text-[#108967]">
                {reviewSummary == null
                  ? ""
                  : reviewSummary.total > 0
                    ? `${reviewSummary.average.toFixed(1)} out of 5 (${reviewSummary.total} review${reviewSummary.total === 1 ? "" : "s"})`
                    : "No reviews yet"}
              </span>
            </div>

            <div
              className={`transition-opacity duration-200 ease-out ${
                mediaFading ? "opacity-30" : "opacity-100"
              }`}
            >
              <PriceDisplay variant={variant} variants={product.variants} zone={zone} presentation="storefront" />
              <p className="mt-1 text-xs text-brand-muted">Taxes included. Shipping calculated at checkout.</p>
              <div className="mt-4">
                <ProductOffersBanner codAvailable={codAvailable} />
              </div>
              <div className="mt-6">
                <ProductBuyBox {...buyBoxProps} />
              </div>
            </div>

            {addDisabled && variant ? (
              <NotifyMeButton productSlug={product.slug} variantId={variant.id} />
            ) : null}

            {product.description ? (
              <div className="border-t border-brand-cream-dark pt-8">
                <ProductRichText
                  html={product.description}
                  emphasize
                  className="pdp-description max-w-none text-[15px] leading-[1.55] text-brand-ink/85"
                />
              </div>
            ) : null}

            {product.shortDescription && !product.description ? (
              <ProductRichText
                html={product.shortDescription}
                emphasize
                className="pdp-description text-[15px] leading-[1.55] text-brand-ink/80"
              />
            ) : null}

            {accordionItems.length > 0 ? (
              <div className="border-t border-brand-cream-dark pt-8">
                <h2 className="flex items-center gap-2 font-sans text-lg font-bold text-[#108967]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-brand-gold" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Product details
                </h2>
                <div className="mt-4">
                  <AccordionDescription items={accordionItems} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-16 space-y-16 border-t border-brand-cream-dark pt-14">
          <ProductReviewsSection productId={product.id} />
        </div>
      </div>

      {/* Mobile / tablet sticky purchase bar (desktop uses fixed cart rail at lg+) */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-50 border-t border-brand-cream-dark bg-brand-ivory/95 px-4 py-3 shadow-[0_-8px_24px_rgba(28,53,42,0.10)] backdrop-blur-md safe-area-pb lg:hidden">
        {hasCartRail ? (
          <Link
            href="/checkout"
            className="mx-auto mb-3 flex min-h-[44px] w-full max-w-lg items-center justify-center rounded-full bg-brand-gold text-sm font-semibold text-brand-night transition-colors hover:bg-[#a37934]"
          >
            Proceed to Buy · {formatINRFromPaise(subtotalInPaise)}
            {cartCount > 0 ? ` (${cartCount})` : ""}
          </Link>
        ) : null}
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-brand-muted">{product.name}</p>
            <p className="text-lg font-bold tracking-tight text-brand-forest">
              {variant ? formatMinorFromPaise(saleMinor, currency) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={addDisabled}
            className="min-h-[44px] rounded-full border border-[#108967] px-4 text-xs font-semibold text-[#108967]"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => void buyNow()}
            disabled={addDisabled}
            className="min-h-[44px] flex-1 rounded-full bg-[#108967] px-4 text-xs font-semibold text-white"
          >
            Buy now
          </button>
        </div>
      </div>
    </>
  );
}
