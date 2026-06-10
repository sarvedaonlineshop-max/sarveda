import { INDIAN_STATES } from "@/lib/indian-states";

export type CheckoutFormInput = {
  email: string;
  phone: string;
  phoneDial: string;
  shippingFullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CheckoutFieldErrors = Partial<Record<keyof CheckoutFormInput, string>>;

export function validateCheckoutForm(form: CheckoutFormInput): string | null {
  return validateCheckoutFormDetailed(form).message;
}

export function validateCheckoutField(
  field: keyof CheckoutFormInput,
  form: CheckoutFormInput
): string | null {
  return validateCheckoutFormDetailed(form).fieldErrors[field] ?? null;
}

export function validateCheckoutFormDetailed(form: CheckoutFormInput): {
  message: string | null;
  fieldErrors: CheckoutFieldErrors;
} {
  const fieldErrors: CheckoutFieldErrors = {};

  const email = form.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }

  const name = form.shippingFullName.trim();
  if (name.length < 2) {
    fieldErrors.shippingFullName = "Enter the recipient name.";
  }

  const line1 = form.line1.trim();
  if (line1.length < 4) {
    fieldErrors.line1 = "Enter a complete street address.";
  }

  const city = form.city.trim();
  if (city.length < 2) {
    fieldErrors.city = "Enter your city.";
  }

  const country = form.country.trim().toUpperCase();
  if (country.length !== 2) {
    fieldErrors.country = "Choose a valid country.";
  }

  const state = form.state.trim();
  if (country === "IN") {
    if (!state) {
      fieldErrors.state = "Choose your state.";
    } else if (!INDIAN_STATES.includes(state as (typeof INDIAN_STATES)[number])) {
      fieldErrors.state = "Choose a valid Indian state.";
    }
    const pin = form.postalCode.replace(/\D/g, "");
    if (pin.length !== 6) {
      fieldErrors.postalCode = "Enter a valid 6-digit PIN code.";
    }
  } else if (!state) {
    fieldErrors.state = "Enter your state or province.";
  }

  const digits = form.phone.replace(/\D/g, "");
  if (country === "IN") {
    const national = digits.startsWith("91") ? digits.slice(2) : digits;
    if (national.length !== 10) {
      fieldErrors.phone = "Enter a valid 10-digit mobile number.";
    }
  } else if (digits.length < 8) {
    fieldErrors.phone = "Enter a valid phone number with country code.";
  }

  const firstError = Object.values(fieldErrors).find(Boolean) ?? null;
  return { message: firstError, fieldErrors };
}

export function toCheckoutApiPhone(form: CheckoutFormInput): string {
  const dial = form.phoneDial.trim().replace(/\s/g, "");
  const digits = form.phone.replace(/\D/g, "");
  if (form.country === "IN") {
    const national = digits.startsWith("91") ? digits.slice(2) : digits;
    return `${dial}${national}`;
  }
  if (digits.startsWith(dial.replace("+", ""))) {
    return `+${digits}`;
  }
  return `${dial}${digits}`;
}
