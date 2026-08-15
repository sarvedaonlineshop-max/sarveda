"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { DeliveryTimeline } from "@/components/product/DeliveryTimeline";
import { PairWithRow } from "@/components/product/PairWithRow";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import { ProductTrustBadges } from "@/components/product/ProductTrustBadges";
import type { Zone } from "@/lib/currency";
import { sortAttributeOptionValues, stockDisplay, UNTRACKED_STOCK_ON_HAND } from "@/lib/variant-utils";
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
  /** Compact "Pair it with" items above purchase buttons */
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
    const groups = Array.from(map.entries()).map(([name, values]) => ({
      name,
      values: sortAttributeOptionValues(name, Array.from(values))
    }));
    if (groups.length > 0) {
      if (axisOrder?.length) {
        const orderKey = (label: string, slug?: string) => {
          if (slug && axisOrder.includes(slug)) return axisOrder.indexOf(slug);
          const byName = axisOrder.findIndex((s) => label.toLowerCase().includes(s.replace(/-/g, " ")));
          if (byName >= 0) return byName;
          return 999;
        };
        return groups.sort((a, b) => {
          const p = orderKey(a.name) - orderKey(b.name);
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
    `rounded-[3px] border px-3.5 py-2 text-sm font-medium transition ${
      active
        ? "border-[#108967] bg-[#108967] text-white shadow-sm"
        : "border-[#108967] bg-white text-[#108967] hover:bg-[#108967]/10"
    }`;

  const wrapperClass = isInline ? "space-y-4" : "rounded-xl border border-stone-200 bg-white p-5 shadow-md ring-1 ring-stone-100";

  return (
    <div className={wrapperClass}>
      {attributeGroups.length > 0 ? (
        <div className={isInline ? "space-y-4" : "mb-4 space-y-4 border-b border-stone-200 pb-4"}>
          {attributeGroups.map((group) => {
            const selected = selectedAttrValues.get(group.name);
            return (
              <div key={group.name}>
                <p className="mb-2 font-sans text-base font-bold text-[#108967]">{group.name}</p>
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
        <div className={isInline ? "py-5" : "mt-4 py-5"}>
          <DeliveryTimeline preparationDays="5 - 6 Days" shippingDays={shippingDays} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {stock ? (
          <p className={`text-sm font-bold ${stock.inStock ? "text-[#108967]" : "text-amber-800"}`}>
            {stock.label}
          </p>
        ) : null}
        <p className="font-sans text-base font-bold text-[#108967]">Quantity</p>
        <div className="inline-flex items-center overflow-hidden rounded-[3px] border border-[#108967]/30 bg-white">
          <button
            type="button"
            disabled={qty <= 1}
            className="flex h-10 w-10 items-center justify-center bg-[#108967] text-lg font-semibold text-white hover:bg-[#0d7353] disabled:opacity-40"
            aria-label="Decrease quantity"
            onClick={() => changeQty(qty - 1)}
          >
            −
          </button>
          <span className="min-w-[2.75rem] text-center text-sm font-semibold tabular-nums text-brand-ink">{qty}</span>
          <button
            type="button"
            disabled={qty >= qtyLimit}
            className="flex h-10 w-10 items-center justify-center bg-[#108967] text-lg font-semibold text-white hover:bg-[#0d7353] disabled:opacity-40"
            aria-label="Increase quantity"
            onClick={() => changeQty(qty + 1)}
          >
            +
          </button>
        </div>
        {stockCap != null && qty >= stockCap ? (
          <p className="w-full text-sm font-medium text-amber-800" role="status">
            {qtyMessage ?? `Only ${stockCap} available`}
          </p>
        ) : qtyMessage ? (
          <p className="w-full text-sm font-medium text-amber-800" role="status">
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
                  ? "min-h-[44px] flex-1 rounded-full bg-[#108967] px-3 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-[#0d7353] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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

          {isInline ? <ProductTrustBadges /> : null}
        </div>
      ) : null}

      {!isInline ? (
        <div className="mt-4">
          <ProductTrustBadges />
        </div>
      ) : null}

      {!isInline && variant ? (
        <p className="mt-4 border-t border-stone-200 pt-4 text-center text-xs text-stone-500">Secure checkout</p>
      ) : null}
    </div>
  );
}
