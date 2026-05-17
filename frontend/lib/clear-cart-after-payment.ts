import { cartClearAll } from "@/lib/cart-api";

/** Best-effort cart wipe after Stripe/PayPal/COD success (server + guest session). */
export async function clearCartAfterPayment(): Promise<void> {
  try {
    await cartClearAll();
  } catch {
    // Non-blocking — webhook may have cleared logged-in cart already
  }
}
