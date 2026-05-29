"use client";

import { FormEvent, useState } from "react";

import { fetchShippingRatesEstimate } from "@/lib/shipping-rates-api";
import { formatINRFromPaise } from "@/lib/money";

type Props = {
  variantId: string;
  country?: string;
};

export function PincodeCheck({ variantId, country = "IN" }: Props) {
  const [pincode, setPincode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const normalized = pincode.replace(/\D/g, "");
    if (country === "IN" && normalized.length !== 6) {
      setError("Enter a valid 6-digit delivery pincode.");
      return;
    }

    setLoading(true);
    try {
      const estimate = await fetchShippingRatesEstimate({
        country,
        pincode: normalized,
        variantIds: [variantId],
        quantities: [1]
      });
      const shipping = estimate.standardShippingInMinorUnits;
      if (shipping <= 0) {
        setMessage(`Delivery available to ${normalized}. Shipping is calculated at checkout.`);
      } else {
        setMessage(
          `Delivery available to ${normalized}. Estimated shipping from ${formatINRFromPaise(shipping)} for this item (final amount at checkout).`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check delivery for this pincode.");
    } finally {
      setLoading(false);
    }
  }

  if (country !== "IN") return null;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-bg p-4">
      <p className="text-sm font-semibold text-brand-ink">Check delivery</p>
      <p className="mt-1 text-xs text-brand-muted">Enter your pincode for shipping estimate on this variant.</p>
      <div className="mt-3 flex gap-2">
        <input
          value={pincode}
          onChange={(event) => setPincode(event.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="Pincode"
          className="min-h-[48px] flex-1 rounded-xl border border-[rgba(196,176,232,0.25)] bg-white px-4 text-sm text-brand-ink focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-brand-lavender-mid/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="min-h-[48px] btn-primary rounded-xl px-4 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "…" : "Check"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-brand-sage">{message}</p> : null}
    </form>
  );
}
