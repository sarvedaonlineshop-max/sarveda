"use client";

import { useEffect, useMemo, useState } from "react";

import { checkoutInputClass, checkoutLabelClass } from "@/lib/checkout-ui";
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
        <span className={checkoutLabelClass}>Full name</span>
        <input
          required
          autoComplete="name"
          className={checkoutInputClass}
          value={form.shippingFullName}
          onChange={(event) => patch({ shippingFullName: event.target.value })}
        />
        {fieldErrors?.shippingFullName ? <p className="mt-1 text-xs text-red-600">{fieldErrors.shippingFullName}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className={checkoutLabelClass}>Email</span>
        <input
          required
          type="email"
          autoComplete="email"
          className={checkoutInputClass}
          value={form.email}
          onChange={(event) => patch({ email: event.target.value })}
        />
        {fieldErrors?.email ? <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className={checkoutLabelClass}>Mobile number</span>
        <div className="flex gap-2">
          <select
            className={`${checkoutInputClass} w-28 bg-brand-ivory px-2 text-sm`}
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
            className={`${checkoutInputClass} flex-1`}
            value={form.phone}
            onChange={(event) => patch({ phone: event.target.value })}
          />
        </div>
        {fieldErrors?.phone ? <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className={checkoutLabelClass}>Address line 1</span>
        <input
          required
          autoComplete="address-line1"
          className={checkoutInputClass}
          value={form.line1}
          onChange={(event) => patch({ line1: event.target.value })}
        />
        {fieldErrors?.line1 ? <p className="mt-1 text-xs text-red-600">{fieldErrors.line1}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className={checkoutLabelClass}>Address line 2 (optional)</span>
        <input
          autoComplete="address-line2"
          className={checkoutInputClass}
          value={form.line2}
          onChange={(event) => patch({ line2: event.target.value })}
        />
      </label>

      <label>
        <span className={checkoutLabelClass}>City</span>
        <input
          required
          autoComplete="address-level2"
          className={checkoutInputClass}
          value={form.city}
          onChange={(event) => patch({ city: event.target.value })}
        />
        {fieldErrors?.city ? <p className="mt-1 text-xs text-red-600">{fieldErrors.city}</p> : null}
      </label>

      <label>
        <span className={checkoutLabelClass}>State</span>
        {isIndia ? (
          <select
            required
            className={`${checkoutInputClass} bg-brand-ivory`}
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
            className={checkoutInputClass}
            value={form.state}
            onChange={(event) => patch({ state: event.target.value })}
          />
        )}
        {fieldErrors?.state ? <p className="mt-1 text-xs text-red-600">{fieldErrors.state}</p> : null}
      </label>

      <label>
        <span className={checkoutLabelClass}>{isIndia ? "PIN code" : "Postal code"}</span>
        <input
          required
          inputMode={isIndia ? "numeric" : "text"}
          autoComplete="postal-code"
          maxLength={isIndia ? 6 : 20}
          className={checkoutInputClass}
          value={form.postalCode}
          onChange={(event) => patch({ postalCode: event.target.value })}
        />
        {fieldErrors?.postalCode ? <p className="mt-1 text-xs text-red-600">{fieldErrors.postalCode}</p> : null}
      </label>

      <label className="sm:col-span-2">
        <span className={checkoutLabelClass}>Country</span>
        {indiaCheckoutOnly ? (
          <div className="min-h-[48px] rounded-[10px] border border-[rgba(196,176,232,0.3)] bg-brand-bg px-3 py-3 text-sm text-brand-mid">
            India — domestic delivery only on this site.
          </div>
        ) : (
          <>
            <input
              type="search"
              placeholder="Search country"
              className={`${checkoutInputClass} mb-2 min-h-[44px] text-sm`}
              value={countryQuery}
              onChange={(event) => setCountryQuery(event.target.value)}
            />
            <select
              required
              className={`${checkoutInputClass} bg-brand-ivory`}
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
