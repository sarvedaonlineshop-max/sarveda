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
  onVariantChange: (variantId: string) => void;
  isDigital: boolean;
  shippingDays: string;
  available: number | null;
  variantForStock: ProductVariantDetail | null;
};

export function ProductBuyBox({
  variant,
  variants,
  zone,
  saleMinor,
  qty,
  onQtyChange,
  maxQty,
  addDisabled,
  addedFlash,
  onAdd,
  onVariantChange,
  isDigital,
  shippingDays,
  available,
  variantForStock
}: Props) {
  const stock = variantForStock ? stockDisplay(variantForStock) : null;
  const preparationDays = "5 - 10 Days";

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
        if (n.includes("type")) return 1;
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
    return uniqueSkuLabels.length > 1 ? [{ name: "Variant", values: uniqueSkuLabels }] : [];
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
        if (groupName === "Variant") {
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

  return (
    <div className="rounded-xl border border-[rgba(196,176,232,0.25)] bg-brand-bg/80 p-5 shadow-sm">
      {attributeGroups.length > 0 ? (
        <div className="mb-4 space-y-4 border-b border-[rgba(196,176,232,0.25)] pb-4">
          {attributeGroups.map((group) => {
            const selected = selectedAttrValues.get(group.name);
            return (
              <div key={group.name}>
                <p className="mb-2 text-sm font-semibold text-brand-ink">{group.name}:</p>
                <div className="flex flex-wrap gap-2">
                  {group.values.map((value) => {
                    const active = selected === value;
                    return (
                      <button
                        key={`${group.name}-${value}`}
                        type="button"
                        onClick={() => pickVariantFor(group.name, value)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                          active
                            ? "border-brand-violet bg-brand-violet text-white"
                            : "border-[rgba(196,176,232,0.35)] bg-white text-brand-mid hover:border-brand-violet"
                        }`}
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

      <PriceDisplay variant={variant} variants={variants} zone={zone} presentation="storefront" size="compact" />

      {!isDigital ? (
        <div className="mt-4 space-y-3">
          <EstimatedDelivery preparationDays={preparationDays} shippingDays={shippingDays} />
          <DeliveryTimeline preparationDays={preparationDays} shippingDays={shippingDays} />
        </div>
      ) : null}

      {stock ? (
        <p className={`mt-3 text-sm ${stock.inStock ? "text-brand-mid" : "text-brand-coral"}`}>
          <span className={`font-semibold ${stock.inStock ? "text-brand-sage" : ""}`}>{stock.label}</span>
        </p>
      ) : null}

      <div className="mt-4">
        <label htmlFor="pdp-qty" className="mb-2 block text-sm font-medium text-brand-mid">
          Quantity:
        </label>
        <select
          id="pdp-qty"
          value={qty}
          onChange={(e) => onQtyChange(Number(e.target.value))}
          className="w-full rounded-lg border border-[rgba(196,176,232,0.35)] bg-white px-3 py-2.5 text-sm text-brand-ink shadow-sm focus:border-brand-violet focus:outline-none focus:ring-1 focus:ring-brand-lavender-mid"
        >
          {Array.from({ length: Math.min(maxQty, 10) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={addDisabled}
        className="mt-4 w-full rounded-lg bg-brand-violet py-3.5 text-sm font-semibold uppercase tracking-wide text-white shadow-violet-sm transition hover:-translate-y-px hover:bg-brand-violet-mid disabled:cursor-not-allowed disabled:bg-brand-violet-light disabled:text-brand-muted disabled:hover:translate-y-0"
      >
        {addDisabled ? "Out of stock" : "Add to cart"}
      </button>

      <Link
        href="/cart"
        className="mt-2 flex w-full items-center justify-center rounded-lg border border-[rgba(196,176,232,0.35)] bg-white py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-violet-light"
      >
        Go to cart
      </Link>

      {addedFlash ? (
        <p className="mt-2 text-center text-sm font-medium text-brand-sage" role="status">
          Added to cart
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-brand-sage-light p-3 sm:gap-3">
        {[
          {
            icon: "🎵",
            title: "Authentic & Sustainable Craftsmanship",
            subtitle: "Authentic, eco-conscious from India and beyond"
          },
          { icon: "🌍", title: "Global Reach", subtitle: "Shipped safe & secure to 50+ countries" },
          { icon: "🛡️", title: "Trusted Worldwide", subtitle: "Favoured by therapists & practitioners" },
          { icon: "🔒", title: "Secure Payments", subtitle: "100% encrypted via trusted gateways" }
        ].map((badge) => (
          <div key={badge.title} className="rounded-md bg-white px-2 py-3 text-center sm:px-3">
            <p className="text-lg">{badge.icon}</p>
            <p className="mt-1 text-[11px] font-semibold leading-snug text-brand-ink sm:text-xs">{badge.title}</p>
            <p className="mt-1 text-[10px] leading-snug text-brand-muted">{badge.subtitle}</p>
          </div>
        ))}
      </div>

      {variant ? (
        <p className="mt-4 border-t border-[rgba(196,176,232,0.25)] pt-4 text-center text-xs text-brand-muted">
          Secure checkout
        </p>
      ) : null}
    </div>
  );
}
