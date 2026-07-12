import type { CheckoutFormInput } from "@/lib/checkout-validation";
import { validateCheckoutFormDetailed } from "@/lib/checkout-validation";

export type ProfileFormInput = {
  name: string;
  phone: string;
  email: string;
  shippingFullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type ProfileFieldErrors = Partial<Record<keyof ProfileFormInput, string>>;

export function validateProfileForm(form: ProfileFormInput): {
  message: string | null;
  fieldErrors: ProfileFieldErrors;
} {
  const fieldErrors: ProfileFieldErrors = {};

  const name = form.name.trim();
  if (name.length < 2) {
    fieldErrors.name = "Enter your full name (at least 2 characters).";
  }

  const checkoutLike: CheckoutFormInput = {
    email: form.email.trim(),
    phone: form.phone.trim(),
    phoneDial: "+91",
    shippingFullName: form.shippingFullName.trim() || name,
    line1: form.line1.trim(),
    line2: form.line2.trim() || undefined,
    city: form.city.trim(),
    state: form.state.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim().toUpperCase() || "IN"
  };

  const checkout = validateCheckoutFormDetailed(checkoutLike);
  if (checkout.fieldErrors.phone) fieldErrors.phone = checkout.fieldErrors.phone;
  if (checkout.fieldErrors.shippingFullName) {
    fieldErrors.shippingFullName = "Enter the recipient name for deliveries.";
  }
  if (checkout.fieldErrors.line1) fieldErrors.line1 = checkout.fieldErrors.line1;
  if (checkout.fieldErrors.city) fieldErrors.city = checkout.fieldErrors.city;
  if (checkout.fieldErrors.state) fieldErrors.state = checkout.fieldErrors.state;
  if (checkout.fieldErrors.postalCode) fieldErrors.postalCode = checkout.fieldErrors.postalCode;
  if (checkout.fieldErrors.country) fieldErrors.country = checkout.fieldErrors.country;

  const message = Object.values(fieldErrors)[0] ?? checkout.message;
  return {
    message: message ?? null,
    fieldErrors
  };
}
