/** Build checkout URL that restores a cancelled order into the cart on arrival. */
export function checkoutReorderUrl(orderNumber: string, email: string): string {
  const q = new URLSearchParams({
    reorderOrder: orderNumber,
    reorderEmail: email.trim().toLowerCase()
  });
  return `/checkout?${q.toString()}`;
}
