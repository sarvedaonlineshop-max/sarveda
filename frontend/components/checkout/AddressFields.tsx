"use client";

import { useEffect, useMemo, useState } from "react";

import { COUNTRIES, countryByCode } from "@/lib/countries";
import { INDIAN_STATES } from "@/lib/indian-states";

export type CheckoutAddressForm = {
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

type Props = {
  form: CheckoutAddressForm;
  onChange: (next: CheckoutAddressForm) => void;
  fieldErrors?: Partial<Record<keyof CheckoutAddressForm, string>>;
  /** When true (e.g. NEXT_PUBLIC_INDIA_CHECKOUT_ONLY), country is locked to India. */
  indiaCheckoutOnly?: boolean;
};

export function AddressFields({ form, onChange, fieldErrors, indiaCheckoutOnly = false }: Props) {
  const [countryQuery, setCountryQuery] = useState("");
  const isIndia = form.country === "IN";

  useEffect(() => {
    if (indiaCheckoutOnly && form.country !== "IN") {
      onChange({ ...form, country: "IN", phoneDial: "+91" });
    }
  }, [indiaCheckoutOnly, form, onChange]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (row) => row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q)
    );
  }, [countryQuery]);

  function patch(partial: Partial<CheckoutAddressForm>) {
    onChange({ ...form, ...partial });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Full name</span>
        <input
          required
          autoComplete="name"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.shippingFullName}
          onChange={(event) => patch({ shippingFullName: event.target.value })}
        />
        {fieldErrors?.shippingFullName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.shippingFullName}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Email</span>
        <input
          required
          type="email"
          autoComplete="email"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.email}
          onChange={(event) => patch({ email: event.target.value })}
        />
        {fieldErrors?.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
      </label>

      <label className="sm:col-span-2">
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
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={isIndia ? "10-digit mobile" : "Phone number"}
            className="min-h-[48px] flex-1 rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
            value={form.phone}
            onChange={(event) => patch({ phone: event.target.value })}
          />
        </div>
        {fieldErrors?.phone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Address line 1</span>
        <input
          required
          autoComplete="address-line1"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.line1}
          onChange={(event) => patch({ line1: event.target.value })}
        />
        {fieldErrors?.line1 ? <p className="mt-1 text-xs text-red-600">{fieldErrors.line1}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Address line 2 (optional)</span>
        <input
          autoComplete="address-line2"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.line2}
          onChange={(event) => patch({ line2: event.target.value })}
        />
      </label>

      <label>
        <span className="mb-1 block text-sm font-medium text-stone-700">City</span>
        <input
          required
          autoComplete="address-level2"
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.city}
          onChange={(event) => patch({ city: event.target.value })}
        />
        {fieldErrors?.city ? <p className="mt-1 text-xs text-red-600">{fieldErrors.city}</p> : null}
      </label>

      <label>
        <span className="mb-1 block text-sm font-medium text-stone-700">State</span>
        {isIndia ? (
          <select
            required
            className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
            value={form.state}
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
            className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
            value={form.state}
            onChange={(event) => patch({ state: event.target.value })}
          />
        )}
        {fieldErrors?.state ? <p className="mt-1 text-xs text-red-600">{fieldErrors.state}</p> : null}
      </label>

      <label>
        <span className="mb-1 block text-sm font-medium text-stone-700">{isIndia ? "PIN code" : "Postal code"}</span>
        <input
          required
          inputMode={isIndia ? "numeric" : "text"}
          autoComplete="postal-code"
          maxLength={isIndia ? 6 : 20}
          className="min-h-[48px] w-full rounded-xl border border-stone-200 px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
          value={form.postalCode}
          onChange={(event) => patch({ postalCode: event.target.value })}
        />
        {fieldErrors?.postalCode ? <p className="mt-1 text-xs text-red-600">{fieldErrors.postalCode}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-stone-700">Country</span>
        {indiaCheckoutOnly ? (
          <div className="min-h-[48px] rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-800">
            India — domestic delivery only on this site.
          </div>
        ) : (
          <>
            <input
              type="search"
              placeholder="Search country"
              className="mb-2 min-h-[44px] w-full rounded-xl border border-stone-200 px-3 text-sm text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
              value={countryQuery}
              onChange={(event) => setCountryQuery(event.target.value)}
            />
            <select
              required
              className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 text-stone-900 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/20"
              value={form.country}
              onChange={(event) => {
                const country = event.target.value;
                const dial = countryByCode(country)?.dial ?? form.phoneDial;
                patch({ country, phoneDial: dial });
              }}
            >
              {filteredCountries.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </>
        )}
        {fieldErrors?.country ? <p className="mt-1 text-xs text-red-600">{fieldErrors.country}</p> : null}
      </label>
    </div>
  );
}
