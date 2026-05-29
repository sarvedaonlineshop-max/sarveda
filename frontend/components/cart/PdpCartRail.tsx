"use client";

import { useCartData } from "@/components/cart/CartProvider";
import { CartCheckoutSidebar } from "@/components/cart/CartCheckoutSidebar";
import { cartSidebarFixedClass, cartSidebarTopClass } from "@/lib/cart-sidebar-layout";

/**
 * Fixed narrow cart rail on PDP (desktop lg+). Page scrolls; rail stays pinned to the viewport right edge.
 */
export function PdpCartRail() {
  const { items, itemCount, loading } = useCartData();
  const hasItems = itemCount > 0 || items.length > 0;

  if (loading && !hasItems) return null;
  if (!hasItems) return null;

  return (
    <aside
      className={`${cartSidebarFixedClass} ${cartSidebarTopClass}`}
      aria-label="Cart summary"
    >
      <CartCheckoutSidebar mode="pdp-rail" className="flex h-full min-h-0 flex-col" />
    </aside>
  );
}
