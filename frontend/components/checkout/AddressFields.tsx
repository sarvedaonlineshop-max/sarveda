"use client";

import { useEffect, useState, type ReactNode } from "react";

import { COUNTRIES, countryByCode } from "@/lib/countries";
import type { CheckoutFieldErrors } from "@/lib/checkout-validation";
import { validateCheckoutField, type CheckoutFormInput } from "@/lib/checkout-validation";
import { INDIAN_STATES } from "@/lib/indian-states";

export type CheckoutAddressForm = CheckoutFormInput;

type Props = {
  form: CheckoutAddressForm;
  onChange: (next: CheckoutAddressForm) => void;
  fieldErrors?: CheckoutFieldErrors;
  indiaCheckoutOnly?: boolean;
  /** After Pay is clicked with invalid fields, show every error. */
  showAllErrors?: boolean;
};

type FieldKey = keyof CheckoutAddressForm;

function FieldFeedback({
  message,
  state
}: {
  message?: string | null;
  state: "idle" | "valid" | "invalid";
}) {
  if (state === "valid") {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700" role="status">
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold">
          ✓
        </span>
        Looks good
      </p>
    );
  }
  if (state === "invalid" && message) {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600" role="alert">
        <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold">
          ✕
        </span>
        <span>{message}</span>
      </p>
    );
  }
  return null;
}

function inputClass(state: "idle" | "valid" | "invalid"): string {
  const base =
    "min-h-[48px] w-full rounded-xl border px-3 pr-10 text-stone-900 focus:outline-none focus:ring-2";
  if (state === "valid") {
    return `${base} border-emerald-300 bg-emerald-50/40 focus:border-emerald-500 focus:ring-emerald-500/20`;
  }
  if (state === "invalid") {
    return `${base} border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20`;
  }
  return `${base} border-stone-200 focus:border-amber-700 focus:ring-amber-700/20`;
}

function ValidatedLabel({
  label,
  children,
  state,
  htmlFor
}: {
  label: string;
  children: ReactNode;
  state: "idle" | "valid" | "invalid";
  htmlFor?: string;
}) {
  return (
    <label className="relative block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      <div className="relative">
        {children}
        {state !== "idle" ? (
          <span
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
              state === "valid" ? "text-emerald-600" : "text-red-600"
            }`}
            aria-hidden
          >
            {state === "valid" ? "✓" : "✕"}
          </span>
        ) : null}
      </div>
    </label>
  );
}

export function AddressFields({
  form,
  onChange,
  fieldErrors,
  indiaCheckoutOnly = false,
  showAllErrors = false
}: Props) {
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const isIndia = form.country === "IN";

  useEffect(() => {
    if (indiaCheckoutOnly && form.country !== "IN") {
      onChange({ ...form, country: "IN", phoneDial: "+91" });
    }
  }, [indiaCheckoutOnly, form, onChange]);

  function patch(partial: Partial<CheckoutAddressForm>) {
    onChange({ ...form, ...partial });
  }

  function touch(field: FieldKey) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function isFieldTouched(field: FieldKey): boolean {
    return Boolean(touched[field] || showAllErrors || fieldErrors?.[field]);
  }

  function fieldState(field: FieldKey): "idle" | "valid" | "invalid" {
    const message =
      fieldErrors?.[field] ?? (isFieldTouched(field) ? validateCheckoutField(field, form) : null);
    if (!isFieldTouched(field)) return "idle";
    return message ? "invalid" : "valid";
  }

  function fieldMessage(field: FieldKey): string | null {
    return fieldErrors?.[field] ?? (isFieldTouched(field) ? validateCheckoutField(field, form) : null);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Country</span>
        {indiaCheckoutOnly ? (
          <div className="min-h-[48px] rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-800">
            India — domestic delivery only on this site.
          </div>
        ) : (
          <select
            required
            className={`${inputClass(fieldState("country"))} bg-white`}
            value={form.country}
            onBlur={() => touch("country")}
            onChange={(event) => {
              const country = event.target.value;
              const dial = countryByCode(country)?.dial ?? form.phoneDial;
              patch({ country, phoneDial: dial });
            }}
          >
            {COUNTRIES.map((row) => (
              <option key={row.code} value={row.code}>
                {row.name} ({row.code})
              </option>
            ))}
          </select>
        )}
        <FieldFeedback message={fieldMessage("country")} state={fieldState("country")} />
      </div>

      <div className="sm:col-span-2">
        <ValidatedLabel
          label="Full name"
          state={fieldState("shippingFullName")}
          htmlFor="checkout-full-name"
        >
          <input
            id="checkout-full-name"
            required
            autoComplete="name"
            className={inputClass(fieldState("shippingFullName"))}
            value={form.shippingFullName}
            onBlur={() => touch("shippingFullName")}
            onChange={(event) => patch({ shippingFullName: event.target.value })}
          />
        </ValidatedLabel>
        <FieldFeedback message={fieldMessage("shippingFullName")} state={fieldState("shippingFullName")} />
      </div>

      <div className="sm:col-span-2">
        <ValidatedLabel label="Email" state={fieldState("email")} htmlFor="checkout-email">
          <input
            id="checkout-email"
            required
            type="email"
            autoComplete="email"
            className={inputClass(fieldState("email"))}
            value={form.email}
            onBlur={() => touch("email")}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </ValidatedLabel>
        <FieldFeedback message={fieldMessage("email")} state={fieldState("email")} />
      </div>

      <div className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Mobile number</span>
        <div className="flex gap-2">
          <select
            className="min-h-[48px] w-28 rounded-xl border border-stone-200 bg-white px-2 text-sm text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
            value={form.phoneDial}
            onChange={(event) => patch({ phoneDial: event.target.value })}
            aria-label="Country calling code"
          >
            {COUNTRIES.map((row) => (
              <option key={`${row.code}-${row.dial}`} value={row.dial}>
                {row.dial}
              </option>
            ))}
          </select>
          <div className="relative flex-1">
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={isIndia ? "10-digit mobile" : "Phone number"}
              className={`${inputClass(fieldState("phone"))} pr-10`}
              value={form.phone}
              onBlur={() => touch("phone")}
              onChange={(event) => patch({ phone: event.target.value })}
            />
            {fieldState("phone") !== "idle" ? (
              <span
                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
                  fieldState("phone") === "valid" ? "text-emerald-600" : "text-red-600"
                }`}
                aria-hidden
              >
                {fieldState("phone") === "valid" ? "✓" : "✕"}
              </span>
            ) : null}
          </div>
        </div>
        <FieldFeedback message={fieldMessage("phone")} state={fieldState("phone")} />
      </div>

      <div className="sm:col-span-2">
        <ValidatedLabel label="Address line 1" state={fieldState("line1")} htmlFor="checkout-line1">
          <input
            id="checkout-line1"
            required
            autoComplete="address-line1"
            className={inputClass(fieldState("line1"))}
            value={form.line1}
            onBlur={() => touch("line1")}
            onChange={(event) => patch({ line1: event.target.value })}
          />
        </ValidatedLabel>
        <FieldFeedback message={fieldMessage("line1")} state={fieldState("line1")} />
      </div>

      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Address line 2 (optional)</span>
        <input
          autoComplete="address-line2"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.line2}
          onChange={(event) => patch({ line2: event.target.value })}
        />
      </label>

      <div>
        <ValidatedLabel label="City" state={fieldState("city")} htmlFor="checkout-city">
          <input
            id="checkout-city"
            required
            autoComplete="address-level2"
            className={inputClass(fieldState("city"))}
            value={form.city}
            onBlur={() => touch("city")}
            onChange={(event) => patch({ city: event.target.value })}
          />
        </ValidatedLabel>
        <FieldFeedback message={fieldMessage("city")} state={fieldState("city")} />
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-stone-700">State</span>
        {isIndia ? (
          <select
            required
            className={`${inputClass(fieldState("state"))} bg-white`}
            value={form.state}
            onBlur={() => touch("state")}
            onChange={(event) => patch({ state: event.target.value })}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        ) : (
          <input
            required
            autoComplete="address-level1"
            className={inputClass(fieldState("state"))}
            value={form.state}
            onBlur={() => touch("state")}
            onChange={(event) => patch({ state: event.target.value })}
          />
        )}
        <FieldFeedback message={fieldMessage("state")} state={fieldState("state")} />
      </div>

      <div>
        <ValidatedLabel
          label={isIndia ? "PIN code" : "Postal code"}
          state={fieldState("postalCode")}
          htmlFor="checkout-postal"
        >
          <input
            id="checkout-postal"
            required
            inputMode={isIndia ? "numeric" : "text"}
            autoComplete="postal-code"
            maxLength={isIndia ? 6 : 20}
            className={inputClass(fieldState("postalCode"))}
            value={form.postalCode}
            onBlur={() => touch("postalCode")}
            onChange={(event) => patch({ postalCode: event.target.value })}
          />
        </ValidatedLabel>
        <FieldFeedback message={fieldMessage("postalCode")} state={fieldState("postalCode")} />
      </div>
    </div>
  );
}
