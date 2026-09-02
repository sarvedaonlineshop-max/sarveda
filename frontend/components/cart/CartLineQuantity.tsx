"use client";

import type { CartApiItem } from "@/lib/cart-api";

import { useCartQuantityActions } from "@/hooks/useCartQuantityActions";

type Props = {
  line: CartApiItem;
  size?: "sm" | "md";
  showDeleteAtOne?: boolean;
};

/** Shared +/- (and optional trash-at-qty-1) control for cart page + PDP rail. */
export function CartLineQuantity({ line, size = "md", showDeleteAtOne = false }: Props) {
  const { decrease, increase, removeLine, isAnyBusy } = useCartQuantityActions();
  const busy = isAnyBusy;
  const atMin = line.quantity <= 1;
  const atMax = !line.dropShipEnabled && line.maxQuantity != null && line.quantity >= line.maxQuantity;

  const btnClass =
    size === "sm"
      ? "flex h-7 w-7 shrink-0 items-center justify-center text-brand-forest hover:bg-brand-forest/5 disabled:opacity-50"
      : "flex h-9 w-9 items-center justify-center text-brand-forest hover:bg-brand-forest/5 disabled:opacity-50";

  const shellClass =
    size === "sm"
      ? "inline-flex max-w-full items-center rounded-full border border-brand-forest/25 bg-white"
      : "inline-flex items-center rounded-full border border-brand-forest/25 bg-white";

  const qtyClass =
    size === "sm"
      ? "min-w-[1.25rem] text-center text-xs font-semibold tabular-nums"
      : "min-w-[2rem] text-center text-sm font-semibold tabular-nums";

  return (
    <div>
      <div className={shellClass}>
        <button
          type="button"
          disabled={busy}
          className={btnClass}
          aria-label={atMin && showDeleteAtOne ? "Remove from cart" : "Decrease quantity"}
          onClick={() => {
            if (atMin && showDeleteAtOne) void removeLine(line.variantId);
            else void decrease(line.variantId);
          }}
        >
          {atMin && showDeleteAtOne ? (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          ) : (
            "−"
          )}
        </button>
        <span className={qtyClass}>{line.quantity}</span>
        <button
          type="button"
          disabled={busy || atMax}
          className={btnClass}
          aria-label="Increase quantity"
          onClick={() => void increase(line.variantId)}
        >
          +
        </button>
      </div>
      {atMax && line.maxQuantity != null ? (
        <p className="mt-1.5 text-xs font-medium text-amber-800" role="status">
          Only {line.maxQuantity} available
        </p>
      ) : null}
    </div>
  );
}
