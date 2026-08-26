import type { MouseEvent } from "react";

/** Prevent right-click save on product images only. */
export function blockProductImageContextMenu(event: MouseEvent): void {
  event.preventDefault();
}

export const productImageClassName =
  "product-image-protect select-none [-webkit-user-drag:none]";
