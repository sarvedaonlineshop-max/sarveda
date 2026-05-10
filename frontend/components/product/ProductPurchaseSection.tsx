"use client";

import { useMemo, useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";
import type { ProductVariantDetail } from "@/lib/types";

function variantLabel(v: ProductVariantDetail): string {
  if (!v.attributeValues.length) {
    return "Standard";
  }
  return v.attributeValues
    .map((row) => `${row.attributeValue.attribute.name}: ${row.attributeValue.value}`)
    .join(" · ");
}

function pickInitialVariant(variants: ProductVariantDetail[]): ProductVariantDetail | null {
  if (!variants.length) return null;
  const def = variants.find((v) => v.isDefault);
  return def ?? variants[0];
}

type Props = {
  productSlug: string;
  productName: string;
  variants: ProductVariantDetail[];
  /** First gallery image for cart drawer / summaries */
  primaryImageUrl?: string | null;
};

export function ProductPurchaseSection({
  productSlug,
  productName,
  variants,
  primaryImageUrl
}: Props) {
  const initial = useMemo(() => pickInitialVariant(variants), [variants]);
  const [variantId, setVariantId] = useState<string | null>(initial?.id ?? null);
  const [qty, setQty] = useState(1);
  const [addedFlash, setAddedFlash] = useState(false);

  const variant = variants.find((v) => v.id === variantId) ?? initial;

  if (!variant) {
    return <p className="text-sm text-stone-500">This product is not available for purchase.</p>;
  }

  const available =
    variant.inventory != null
      ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved)
      : null;

  const add = () => {
    if (qty < 1) return;
    void (async () => {
      try {
        await cartAdd(variant.id, qty);
        window.dispatchEvent(new CustomEvent("sarveda-open-cart"));
        setAddedFlash(true);
        window.setTimeout(() => setAddedFlash(false), 2200);
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : "Could not add to cart");
      }
    })();
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="font-serif text-2xl font-semibold text-amber-800 sm:text-3xl">
          {formatINRFromPaise(variant.saleInPaise)}
        </p>
        {variant.mrpInPaise > variant.saleInPaise ? (
          <p className="mt-2 text-sm text-stone-500 line-through">
            MRP {formatINRFromPaise(variant.mrpInPaise)}
          </p>
        ) : null}
      </div>

      {variants.length > 1 ? (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">Choose option</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const selected = v.id === variant.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  className={`min-h-[48px] rounded-full border px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    selected
                      ? "border-amber-700 bg-amber-50 text-amber-800 shadow-sm"
                      : "border-stone-200 bg-white text-stone-800 hover:border-amber-400"
                  }`}
                >
                  {variantLabel(v)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {available !== null ? (
        <p className="text-sm text-stone-500">
          {available > 0 ? (
            <>
              <span className="font-medium text-stone-800">{available}</span> in stock
            </>
          ) : (
            <span className="font-medium text-amber-800">Currently out of stock</span>
          )}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="sm:w-28">
          <label htmlFor="qty" className="mb-2 block text-xs font-semibold uppercase tracking-widest text-stone-500">
            Qty
          </label>
          <input
            id="qty"
            type="number"
            min={1}
            max={available != null && available > 0 ? available : 999}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="min-h-[48px] w-full rounded-xl border border-stone-100 bg-white px-3 py-2 text-center text-stone-900 shadow-inner focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={add}
        disabled={available === 0}
        className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
      >
        Add to Cart
      </button>

      <div className="rounded-xl border border-stone-100 bg-stone-50/80 px-4 py-3 text-xs leading-relaxed text-stone-500">
        <p className="font-medium text-stone-600">Shipping &amp; duty</p>
        <p className="mt-1">
          Ships from India · Prices are GST-inclusive · Tracking details shared after dispatch · International customs may
          apply outside India
        </p>
      </div>

      {addedFlash ? (
        <p className="text-sm font-medium text-emerald-600" role="status">
          Added to cart — saved on this device until checkout goes live.
        </p>
      ) : null}
    </div>
  );
}
