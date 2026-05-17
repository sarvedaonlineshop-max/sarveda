"use client";

import { useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import type { ProductListItem } from "@/lib/types";

type Props = {
  product: ProductListItem;
};

export function ProductCardAddButton({ product }: Props) {
  const [flash, setFlash] = useState(false);

  const variantId = product.defaultVariantId;
  const disabled = !variantId;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!variantId) return;
    void (async () => {
      try {
        await cartAdd(variantId, 1);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1600);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Could not add to cart");
      }
    })();
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-stone-900 py-3 text-sm font-semibold tracking-wide text-amber-400 shadow-sm transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
      >
        Add to Cart
      </button>
      {flash ? (
        <p className="absolute -bottom-7 left-0 right-0 text-center text-xs font-medium text-emerald-600" role="status">
          Added
        </p>
      ) : null}
    </div>
  );
}
