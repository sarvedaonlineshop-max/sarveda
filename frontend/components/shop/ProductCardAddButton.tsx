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
    <div className="relative flex flex-col items-center">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        aria-label="Add to cart"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-lg font-light leading-none text-white transition-colors hover:bg-brand-violet-mid disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: disabled ? "rgba(91,62,155,0.35)" : "#5B3E9B" }}
      >
        +
      </button>
      {flash ? (
        <p
          className="absolute -bottom-6 left-1/2 w-max -translate-x-1/2 text-center text-[10px] font-medium text-brand-green"
          role="status"
        >
          Added
        </p>
      ) : null}
    </div>
  );
}
