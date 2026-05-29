"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useCartData } from "@/components/cart/CartProvider";
import { CartCheckoutSidebar } from "@/components/cart/CartCheckoutSidebar";
import { cartSidebarFixedClass, cartSidebarTopClass } from "@/lib/cart-sidebar-layout";

/**
 * Fixed narrow cart rail on PDP (desktop lg+). Rendered on document.body so page transitions never clip it.
 */
export function PdpCartRail() {
  const { items, itemCount } = useCartData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasItems = itemCount > 0 || items.length > 0;
  if (!mounted || !hasItems) return null;

  return createPortal(
    <aside className={`${cartSidebarFixedClass} ${cartSidebarTopClass}`} aria-label="Cart summary">
      <CartCheckoutSidebar mode="pdp-rail" className="flex h-full min-h-0 flex-col" />
    </aside>,
    document.body
  );
}
