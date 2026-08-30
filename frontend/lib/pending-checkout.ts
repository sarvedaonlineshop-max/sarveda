import type { CreateOrderResponse } from "@/lib/checkout-api";

const STORAGE_KEY = "sarveda_pending_checkout";

export type PendingCheckout = CreateOrderResponse & {
  email: string;
  savedAt: string;
  /** Sorted `variantId:qty` fingerprint of the cart when this unpaid order was created. */
  cartFingerprint?: string;
};

export type CartFingerprintLine = {
  variantId: string;
  quantity: number;
};

/** Stable cart identity — used to avoid resuming an unpaid order after the cart changed. */
export function buildCartFingerprint(lines: CartFingerprintLine[]): string {
  return lines
    .map((l) => `${l.variantId}:${l.quantity}`)
    .sort()
    .join("|");
}

export function savePendingCheckout(
  order: CreateOrderResponse,
  email: string,
  cartFingerprint?: string
): void {
  if (typeof window === "undefined") return;
  const payload: PendingCheckout = {
    ...order,
    email: email.trim().toLowerCase(),
    savedAt: new Date().toISOString(),
    ...(cartFingerprint ? { cartFingerprint } : {})
  };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadPendingCheckout(): PendingCheckout | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingCheckout;
  } catch {
    return null;
  }
}

export function clearPendingCheckout(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

/** True when pending unpaid checkout still matches the live cart (and optional email). */
export function pendingMatchesCart(
  pending: PendingCheckout | null,
  cartFingerprint: string,
  email?: string
): boolean {
  if (!pending?.orderNumber || !pending.cartFingerprint) return false;
  if (pending.cartFingerprint !== cartFingerprint) return false;
  if (email && pending.email !== email.trim().toLowerCase()) return false;
  return true;
}
