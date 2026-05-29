"use client";

import { useCartData } from "@/components/cart/CartProvider";
import { CartCheckoutSidebar } from "@/components/cart/CartCheckoutSidebar";
import { cartSidebarFixedClass, cartSidebarTopClass } from "@/lib/cart-sidebar-layout";

/**
 * Fixed narrow cart rail on PDP (desktop). Page scrolls; rail stays pinned to the viewport right edge.
 */
export function PdpCartRail() {
  const { itemCount } = useCartData();
  if (itemCount === 0) return null;

  return (
    <aside
      className={`${cartSidebarFixedClass} ${cartSidebarTopClass}`}
      aria-label="Cart summary"
    >
      <CartCheckoutSidebar mode="pdp-rail" className="flex h-full min-h-0 flex-col" />
    </aside>
  );
}
