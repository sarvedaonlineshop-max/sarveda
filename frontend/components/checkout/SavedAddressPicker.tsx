"use client";

import type { CheckoutAddressForm } from "@/components/checkout/AddressFields";
import { countryByCode } from "@/lib/countries";

export type SavedAddress = {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

type Props = {
  addresses: SavedAddress[];
  onSelect: (form: Partial<CheckoutAddressForm>) => void;
};

export function SavedAddressPicker({ addresses, onSelect }: Props) {
  if (!addresses.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
      <p className="mb-2 text-sm font-semibold text-stone-800">Saved addresses</p>
      <div className="flex flex-col gap-2">
        {addresses.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() =>
              onSelect({
                shippingFullName: a.fullName,
                phone: a.phone.replace(/^\+\d+/, ""),
                phoneDial: countryByCode(a.country)?.dial ?? "+91",
                line1: a.line1,
                line2: a.line2 ?? "",
                city: a.city,
                state: a.state,
                postalCode: a.postalCode,
                country: a.country
              })
            }
            className="rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-amber-400 hover:bg-amber-50/50"
          >
            <span className="font-medium text-stone-900">
              {a.label || a.fullName}
              {a.isDefault ? (
                <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">Default</span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs text-stone-500">
              {a.line1}, {a.city} {a.postalCode}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
