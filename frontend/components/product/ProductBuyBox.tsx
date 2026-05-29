"use client";

import { useMemo } from "react";
import Link from "next/link";

import { DeliveryTimeline } from "@/components/product/DeliveryTimeline";
import { EstimatedDelivery } from "@/components/product/EstimatedDelivery";
import { PriceDisplay } from "@/components/product/PriceDisplay";
import type { Zone } from "@/lib/currency";
import { stockDisplay } from "@/lib/variant-utils";
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
  onBuyNow?: () => void;
  onVariantChange: (variantId: string) => void;
  isDigital: boolean;
  shippingDays: string;
  available: number | null;
  variantForStock: ProductVariantDetail | null;
  showPurchaseActions?: boolean;
  /** Auroville-style inline PDP vs legacy card sidebar */
  layout?: "card" | "inline";
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
  variantForStock,
  showPurchaseActions = true,
  layout = "card"
}: Props) {
  const stock = variantForStock ? stockDisplay(variantForStock) : null;
  const preparationDays = "5 - 10 Days";
  const isInline = layout === "inline";

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
  }, [variants]);

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
      ? `rounded-full border px-4 py-2 text-sm font-medium transition ${
          active
            ? "border-stone-900 bg-stone-900 text-white"
            : "border-stone-300 bg-white text-stone-800 hover:border-stone-900"
        }`
      : `rounded-md border px-3 py-2 text-sm font-medium transition ${
          active
            ? "border-[#1e3a2f] bg-[#1e3a2f] text-white"
            : "border-stone-300 bg-white text-stone-700 hover:border-[#1e3a2f]"
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
                <p className="mb-2 text-sm font-medium text-stone-800">{group.name}</p>
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
        <div className={isInline ? "text-sm text-stone-600" : "mt-4 space-y-3"}>
          {isInline ? (
            <EstimatedDelivery preparationDays={preparationDays} shippingDays={shippingDays} />
          ) : (
            <>
              <EstimatedDelivery preparationDays={preparationDays} shippingDays={shippingDays} />
              <DeliveryTimeline preparationDays={preparationDays} shippingDays={shippingDays} />
            </>
          )}
        </div>
      ) : null}

      {stock ? (
        <p className={`text-sm ${stock.inStock ? "text-stone-600" : "text-amber-800"}`}>
          <span className={`font-semibold ${stock.inStock ? "text-[#108967]" : ""}`}>{stock.label}</span>
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-stone-800">Quantity</p>
        <div className="inline-flex items-center rounded-lg border border-stone-300 bg-white">
          <button
            type="button"
            disabled={qty <= 1}
            className="flex h-11 w-11 items-center justify-center text-lg text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            aria-label="Decrease quantity"
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
          >
            −
          </button>
          <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-stone-900">{qty}</span>
          <button
            type="button"
            disabled={qty >= Math.min(maxQty, 10)}
            className="flex h-11 w-11 items-center justify-center text-lg text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            aria-label="Increase quantity"
            onClick={() => onQtyChange(Math.min(Math.min(maxQty, 10), qty + 1))}
          >
            +
          </button>
        </div>
      </div>

      {showPurchaseActions ? (
        <div className={isInline ? "space-y-3" : undefined}>
          <div className={isInline ? "flex flex-col gap-3 sm:flex-row" : undefined}>
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            className={
              isInline
                ? "min-h-[48px] flex-1 rounded-full border border-stone-900 bg-white px-6 text-sm font-semibold uppercase tracking-wide text-stone-900 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="min-h-[48px] flex-1 rounded-full bg-[#c45a2a] px-6 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#a84a22] disabled:cursor-not-allowed disabled:opacity-50"
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
            <p className="text-center text-sm font-medium text-emerald-600" role="status">
              Added to cart
            </p>
          ) : null}
        </div>
      ) : null}

      {!isInline ? (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-[#f4f8f2] p-3 sm:gap-3">
          {[
            { icon: "🎵", title: "Authentic Craft", subtitle: "Eco-conscious from India" },
            { icon: "🌍", title: "Global Reach", subtitle: "50+ countries" },
            { icon: "🛡️", title: "Trusted", subtitle: "Therapists & practitioners" },
            { icon: "🔒", title: "Secure", subtitle: "Encrypted payments" }
          ].map((badge) => (
            <div key={badge.title} className="rounded-md bg-white px-2 py-3 text-center sm:px-3">
              <p className="text-lg">{badge.icon}</p>
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
