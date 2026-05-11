import type { CreateOrderResponse } from "@/lib/checkout-api";

const STORAGE_KEY = "sarveda_pending_checkout";

export type PendingCheckout = CreateOrderResponse & {
  email: string;
  savedAt: string;
};

export function savePendingCheckout(order: CreateOrderResponse, email: string): void {
  if (typeof window === "undefined") return;
  const payload: PendingCheckout = {
    ...order,
    email: email.trim().toLowerCase(),
    savedAt: new Date().toISOString()
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
