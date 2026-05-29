"use client";

import { useCartData } from "@/components/cart/CartProvider";

/** Thin wrapper — mutation state lives in CartProvider so rail + cart page stay in sync. */
export function useCartQuantityActions() {
  const { decreaseLine, increaseLine, removeLine, isCartMutating } = useCartData();

  return {
    decrease: decreaseLine,
    increase: increaseLine,
    removeLine,
    isBusy: () => isCartMutating,
    isAnyBusy: isCartMutating
  };
}
