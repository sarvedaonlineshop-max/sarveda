"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PairWithRow } from "@/components/product/PairWithRow";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import type { Zone } from "@/lib/currency";
import { stockDisplay, UNTRACKED_STOCK_ON_HAND } from "@/lib/variant-utils";
import type { ProductListItem, ProductVariantDetail } from "@/lib/types";

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
  onBuyNow?: () => void;
  onVariantChange: (variantId: string) => void;
  isDigital: boolean;
  shippingDays: string;
  available: number | null;
  variantForStock: ProductVariantDetail | null;
  showPurchaseActions?: boolean;
  expressShippingEnabled?: boolean;
  /** Attribute slug order for variant pills on PDP */
  axisOrder?: string[];
  /** Auroville-style inline PDP vs legacy card sidebar */
  layout?: "card" | "inline";
  /** Compact "Complete your journey" items above purchase buttons */
  pairWithItems?: ProductListItem[];
};

export function ProductBuyBox({
  variant,
  variants,
  zone,
  qty,
  onQtyChange,
  maxQty,
  addDisabled,
  addedFlash,
  onAdd,
  onBuyNow,
  onVariantChange,
  isDigital,
  shippingDays,
  available,
  variantForStock,
  showPurchaseActions = true,
  expressShippingEnabled = true,
  axisOrder,
  layout = "card",
  pairWithItems = []
}: Props) {
  const stock = variantForStock ? stockDisplay(variantForStock) : null;
  const isInline = layout === "inline";
  const [qtyMessage, setQtyMessage] = useState<string | null>(null);
  const stockCap =
    available != null && available > 0 && available < UNTRACKED_STOCK_ON_HAND ? available : null;
  const qtyLimit = stockCap ?? maxQty;
  const expressDays = zone === "IN" ? "2 - 3 Days" : "5 - 7 Days";
  const showExpressOption = expressShippingEnabled && !isDigital;

  function changeQty(next: number) {
    if (stockCap != null && next > stockCap) {
      setQtyMessage(`Only ${stockCap} available`);
      onQtyChange(stockCap);
      return;
    }
    setQtyMessage(null);
    onQtyChange(Math.max(1, Math.min(qtyLimit, next)));
  }

  const attributeGroups = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of variants) {
      for (const row of v.attributeValues ?? []) {
        const key = row.attributeValue.attribute.name || row.attributeValue.attribute.slug;
        if (!key) continue;
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(row.attributeValue.value);
      }
    }
    const groups = Array.from(map.entries()).map(([name, values]) => ({ name, values: Array.from(values) }));
    if (groups.length > 0) {
      if (axisOrder?.length) {
        const orderKey = (label: string, slug?: string) => {
          if (slug && axisOrder.includes(slug)) return axisOrder.indexOf(slug);
          const byName = axisOrder.findIndex(
            (s) => label.toLowerCase().includes(s.replace(/-/g, " "))
          );
          if (byName >= 0) return byName;
          return 999;
        };
        return groups.sort((a, b) => {
          const p =
            orderKey(a.name) -
            orderKey(b.name);
          if (p !== 0) return p;
          return a.name.localeCompare(b.name);
        });
      }
      const priority = (label: string) => {
        const n = label.toLowerCase();
        if (n.includes("size")) return 0;
        if (n.includes("type") || n.includes("option")) return 1;
        return 2;
      };
      return groups.sort((a, b) => {
        const p = priority(a.name) - priority(b.name);
        if (p !== 0) return p;
        return a.name.localeCompare(b.name);
      });
    }

    const skuLabels = variants
      .map((v) => v.sku?.trim())
      .filter(Boolean)
      .map((sku) => sku!.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim());
    const uniqueSkuLabels = Array.from(new Set(skuLabels));
    return uniqueSkuLabels.length > 1 ? [{ name: "Option", values: uniqueSkuLabels }] : [];
  }, [variants, axisOrder]);

  const selectedAttrValues = useMemo(() => {
    const selected = new Map<string, string>();
    if (!variant) return selected;
    for (const row of variant.attributeValues ?? []) {
      const key = row.attributeValue.attribute.name || row.attributeValue.attribute.slug;
      if (key) selected.set(key, row.attributeValue.value);
    }
    return selected;
  }, [variant]);

  const pickVariantFor = (groupName: string, groupValue: string) => {
    if (!variants.length) return;
    const wanted = new Map(selectedAttrValues);
    wanted.set(groupName, groupValue);

    const fullMatch = variants.find((candidate) => {
      const attrs = new Map(
        (candidate.attributeValues ?? []).map((row) => [
          row.attributeValue.attribute.name || row.attributeValue.attribute.slug,
          row.attributeValue.value
        ])
      );
      return Array.from(wanted.entries()).every(([k, v]) => {
        if (!k) return true;
        return attrs.get(k) === v;
      });
    });
    if (fullMatch) {
      onVariantChange(fullMatch.id);
      return;
    }

    const partialMatch = variants.find((candidate) => {
      if (groupName === "Variant" || groupName === "Option") {
        const candidateLabel = candidate.sku?.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
        return candidateLabel === groupValue;
      }
      return (candidate.attributeValues ?? []).some((row) => {
        const key = row.attributeValue.attribute.name || row.attributeValue.attribute.slug;
        return key === groupName && row.attributeValue.value === groupValue;
      });
    });
    if (partialMatch) onVariantChange(partialMatch.id);
  };

  const pillClass = (active: boolean) =>
    isInline
      ? `rounded-md border px-3.5 py-2 text-sm font-medium transition ${
          active
            ? "border-[#3d4a38] bg-[#3d4a38] text-brand-cream"
            : "border-brand-forest/25 bg-white text-brand-ink hover:border-[#3d4a38]"
        }`
      : `rounded-md border px-3 py-2 text-sm font-medium transition ${
          active
            ? "border-[#3d4a38] bg-[#3d4a38] text-white"
            : "border-stone-300 bg-white text-stone-700 hover:border-[#3d4a38]"
        }`;

  const wrapperClass = isInline ? "space-y-5" : "rounded-xl border border-stone-200 bg-white p-5 shadow-md ring-1 ring-stone-100";

  return (
    <div className={wrapperClass}>
      {attributeGroups.length > 0 ? (
        <div className={isInline ? "space-y-4" : "mb-4 space-y-4 border-b border-stone-200 pb-4"}>
          {attributeGroups.map((group) => {
            const selected = selectedAttrValues.get(group.name);
            return (
              <div key={group.name}>
                <p className="mb-2 text-sm font-medium text-brand-ink">{group.name}</p>
                <div className="flex flex-wrap gap-2">
                  {group.values.map((value) => {
                    const active = selected === value;
                    return (
                      <button
                        key={`${group.name}-${value}`}
                        type="button"
                        onClick={() => pickVariantFor(group.name, value)}
                        className={pillClass(active)}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!isInline ? (
        <PriceDisplay variant={variant} variants={variants} zone={zone} presentation="storefront" size="compact" />
      ) : null}

      {!isDigital ? (
        <div className={isInline ? "space-y-2" : "mt-4 space-y-2"}>
          <div className="flex flex-wrap gap-2">
            <span
              title="Choose shipping speed at checkout"
              className="inline-flex cursor-help items-center gap-2 rounded-xl border border-brand-cream-dark bg-brand-cream px-3 py-2"
            >
              <svg className="h-4 w-4 shrink-0 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM20 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h4m0 0V9a1 1 0 011-1h2.5a1 1 0 01.8.4l1.5 2a1 1 0 01.2.6V16a1 1 0 01-1 1h-1" />
              </svg>
              <span className="leading-tight">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
                  Standard Shipping
                </span>
                <span className="block text-sm font-semibold text-brand-ink">{shippingDays}</span>
              </span>
            </span>
            {showExpressOption ? (
              <span
                title="Choose shipping speed at checkout"
                className="inline-flex cursor-help items-center gap-2 rounded-xl border border-brand-terra/30 bg-brand-terra/5 px-3 py-2"
              >
                <svg className="h-4 w-4 shrink-0 text-brand-terra" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.3 1.046a1 1 0 01.7 1.19L10.62 8H15a1 1 0 01.78 1.625l-7 8.75A1 1 0 017 17.75L8.38 11H4a1 1 0 01-.78-1.625l7-8.75a1 1 0 011.08-.579z" />
                </svg>
                <span className="leading-tight">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-terra">
                    Express Shipping
                  </span>
                  <span className="block text-sm font-semibold text-brand-ink">{expressDays}</span>
                </span>
              </span>
            ) : null}
          </div>
          {showExpressOption ? (
            <p className="text-xs text-brand-muted">Choose shipping speed at checkout.</p>
          ) : null}
        </div>
      ) : null}

      {stock ? (
        <p className={`text-sm ${stock.inStock ? "text-brand-muted" : "text-amber-800"}`}>
          <span className={`font-semibold ${stock.inStock ? "text-brand-sage" : ""}`}>{stock.label}</span>
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-brand-ink">Quantity</p>
        <div className="inline-flex items-center rounded-full border border-brand-forest/20 bg-white">
          <button
            type="button"
            disabled={qty <= 1}
            className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-brand-forest hover:bg-brand-forest/5 disabled:opacity-40"
            aria-label="Decrease quantity"
            onClick={() => changeQty(qty - 1)}
          >
            −
          </button>
          <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-brand-ink">{qty}</span>
          <button
            type="button"
            disabled={qty >= qtyLimit}
            className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-brand-forest hover:bg-brand-forest/5 disabled:opacity-40"
            aria-label="Increase quantity"
            onClick={() => changeQty(qty + 1)}
          >
            +
          </button>
        </div>
        {stockCap != null && qty >= stockCap ? (
          <p className="mt-2 text-sm font-medium text-amber-800" role="status">
            {qtyMessage ?? `Only ${stockCap} available`}
          </p>
        ) : qtyMessage ? (
          <p className="mt-2 text-sm font-medium text-amber-800" role="status">
            {qtyMessage}
          </p>
        ) : null}
      </div>

      {showPurchaseActions ? (
        <div className={isInline ? "space-y-3" : undefined}>
          {isInline && pairWithItems.length > 0 ? <PairWithRow items={pairWithItems} compact /> : null}
          <div className={isInline ? "flex gap-2" : undefined}>
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className={
              isInline
                ? "min-h-[44px] flex-1 rounded-full bg-brand-forest px-3 text-xs font-semibold tracking-wide text-brand-cream transition-colors hover:bg-brand-night disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                : "mt-4 w-full rounded-lg bg-[#108967] py-3.5 text-sm font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#0d7353] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            }
          >
            {addDisabled ? "Out of stock" : "Add to cart"}
          </button>

          {isInline && onBuyNow ? (
            <button
              type="button"
              onClick={onBuyNow}
              disabled={addDisabled}
              className="min-h-[44px] flex-1 rounded-full bg-brand-gold px-3 text-xs font-semibold tracking-wide text-brand-night transition-colors hover:bg-[#a37934] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              Buy it now
            </button>
          ) : null}

          {!isInline ? (
            <Link
              href="/cart"
              className="mt-2 flex w-full items-center justify-center rounded-lg border border-stone-300 bg-white py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              Go to cart
            </Link>
          ) : null}
          </div>

          {addedFlash ? (
            <p className="text-center text-sm font-medium text-brand-sage" role="status">
              Added to cart
            </p>
          ) : null}

          {isInline ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-brand-cream-dark pt-4 text-xs text-brand-muted">
              {[
                {
                  label: "100% authentic",
                  icon: (
                    <>
                      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                    </>
                  )
                },
                {
                  label: "Visa · Mastercard · PayPal",
                  icon: (
                    <>
                      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                      <path d="M15 18H9" />
                      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14" />
                      <circle cx="17" cy="18" r="2" />
                      <circle cx="7" cy="18" r="2" />
                    </>
                  )
                },
                {
                  label: "Easy returns",
                  icon: (
                    <>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </>
                  )
                }
              ].map((item) => (
                <span key={item.label} className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-gold" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {item.icon}
                  </svg>
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!isInline ? (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#f4f8f2] p-3 sm:gap-3">
          {[
            {
              icon: (
                <>
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </>
              ),
              title: "Authentic Craft",
              subtitle: "Eco-conscious from India"
            },
            {
              icon: (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </>
              ),
              title: "Global Reach",
              subtitle: "50+ countries"
            },
            {
              icon: (
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
              ),
              title: "Trusted",
              subtitle: "Therapists & practitioners"
            },
            {
              icon: (
                <>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </>
              ),
              title: "Secure",
              subtitle: "Encrypted payments"
            }
          ].map((badge) => (
            <div key={badge.title} className="rounded-md bg-white px-2 py-3 text-center sm:px-3">
              <p className="flex justify-center text-brand-gold">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {badge.icon}
                </svg>
              </p>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-stone-800 sm:text-xs">{badge.title}</p>
              <p className="mt-1 text-[10px] leading-snug text-stone-500">{badge.subtitle}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!isInline && variant ? (
        <p className="mt-4 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">Secure checkout</p>
      ) : null}
    </div>
  );
}
