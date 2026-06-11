import { reorderCancelledOrder } from "@/lib/orders-api";

type CheckoutRouter = { push: (href: string) => void };

/** Restore cancelled-order lines to cart (idempotent) and open checkout. */
export async function reorderCancelledAndCheckout(
  orderNumber: string,
  email: string,
  router: CheckoutRouter
): Promise<{ restoredCount: number; skipped: string[] }> {
  const result = await reorderCancelledOrder(orderNumber, email);
  router.push("/checkout");
  return {
    restoredCount: result.restoredCount,
    skipped: result.skipped.map((s) => s.name)
  };
}
