"use client";

import { useMemo, useState } from "react";

import { PincodeCheck } from "@/components/product/PincodeCheck";
import { cartAdd } from "@/lib/cart-api";
import { discountPercentOff, formatINRFromPaise, savingsInPaise } from "@/lib/money";
import type { ProductVariantDetail } from "@/lib/types";

function variantLabel(variant: ProductVariantDetail): string {
  if (!variant.attributeValues.length) {
    return "Standard";
  }
  return variant.attributeValues
    .map((row) => `${row.attributeValue.attribute.name}: ${row.attributeValue.value}`)
    .join(" · ");
}

function pickInitialVariant(variants: ProductVariantDetail[]): ProductVariantDetail | null {
  if (!variants.length) return null;
  const def = variants.find((variant) => variant.isDefault);
  return def ?? variants[0];
}

type Props = {
  productName: string;
  variants: ProductVariantDetail[];
};

export function ProductPurchaseSection({ productName, variants }: Props) {
  const initial = useMemo(() => pickInitialVariant(variants), [variants]);
  const [variantId, setVariantId] = useState<string | null>(initial?.id ?? null);
  const [qty, setQty] = useState(1);
  const [addedFlash, setAddedFlash] = useState(false);

  const variant = variants.find((item) => item.id === variantId) ?? initial;

  if (!variant) {
    return <p className="text-sm text-stone-500">This product is not available for purchase.</p>;
  }

  const available =
    variant.inventory != null
      ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved)
      : null;

  const showVariantPicker =
    variants.length > 1 &&
    variants.some((item) => {
      const label = variantLabel(item);
      return label !== "Standard";
    });

  const add = () => {
    if (qty < 1) return;
    void (async () => {
      try {
        await cartAdd(variant.id, qty);
        setAddedFlash(true);
        window.setTimeout(() => setAddedFlash(false), 2200);
      } catch (error) {
        console.error(error);
        alert(error instanceof Error ? error.message : "Could not add to cart");
      }
    })();
  };

  const addDisabled = available === 0;
  const discountPercent = discountPercentOff(variant.mrpInPaise, variant.saleInPaise);
  const savings = savingsInPaise(variant.mrpInPaise, variant.saleInPaise);

  return (
    <>
      <div className="space-y-6 px-4 pb-28 md:space-y-8 md:px-0 md:pb-0">
        <div className="space-y-2">
          {discountPercent ? (
            <span className="inline-flex rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
              {discountPercent}% off
            </span>
          ) : null}
          <p className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            {formatINRFromPaise(variant.saleInPaise)}
          </p>
          {variant.mrpInPaise > variant.saleInPaise ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-500">
              <span className="line-through">M.R.P. {formatINRFromPaise(variant.mrpInPaise)}</span>
              {savings > 0 ? (
                <span className="font-medium text-emerald-700">Save {formatINRFromPaise(savings)}</span>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-stone-500">Inclusive of all taxes</p>
        </div>

        <PincodeCheck />

        {showVariantPicker ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-500">Select option</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((item) => {
                const selected = item.id === variant.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVariantId(item.id)}
                    className={`min-h-[48px] rounded-full border px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                      selected
                        ? "border-amber-700 bg-amber-50 text-amber-800 shadow-sm"
                        : "border-stone-200 bg-white text-stone-800 hover:border-amber-400"
                    }`}
                  >
                    {variantLabel(item)}
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

        <div className="hidden flex-col gap-4 sm:flex-row sm:items-end md:flex">
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
              onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
              className="min-h-[48px] w-full rounded-xl border border-stone-100 bg-white px-3 py-2 text-center text-stone-900 shadow-inner focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
            />
          </div>
          <button
            type="button"
            onClick={add}
            disabled={addDisabled}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none"
          >
            Add to Cart
          </button>
        </div>

        {addedFlash ? (
          <p className="text-sm font-medium text-emerald-600" role="status">
            Added to cart.
          </p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md safe-area-pb md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-stone-500">{productName}</p>
            <p className="text-lg font-bold tracking-tight text-stone-900">
              {formatINRFromPaise(variant.saleInPaise)}
            </p>
          </div>
          <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50">
            <button
              type="button"
              className="flex h-11 min-w-[40px] items-center justify-center text-lg text-stone-700"
              aria-label="Decrease quantity"
              onClick={() => setQty((value) => Math.max(1, value - 1))}
            >
              −
            </button>
            <span className="min-w-[2rem] text-center text-sm font-medium tabular-nums">{qty}</span>
            <button
              type="button"
              className="flex h-11 min-w-[40px] items-center justify-center text-lg text-stone-700"
              aria-label="Increase quantity"
              onClick={() => setQty((value) => value + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={add}
            disabled={addDisabled}
            className="min-h-[48px] flex-1 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-700 hover:text-white disabled:bg-stone-300 disabled:text-stone-500"
          >
            Add to cart
          </button>
        </div>
      </div>
    </>
  );
}
