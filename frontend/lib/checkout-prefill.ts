import type { CheckoutFormInput } from "./checkout-validation";

const STORAGE_KEY = "sarveda_checkout_shipping_v1";

export type SavedCheckoutShipping = {
  email: string;
  phone: string;
  phoneDial: string;
  shippingFullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export function loadSavedCheckoutShipping(): Partial<SavedCheckoutShipping> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<SavedCheckoutShipping>;
  } catch {
    return null;
  }
}

export function saveCheckoutShipping(value: CheckoutFormInput): void {
  if (typeof window === "undefined") return;
  const payload: SavedCheckoutShipping = {
    ...value,
    line2: value.line2 ?? ""
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
