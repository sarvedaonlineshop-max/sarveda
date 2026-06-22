"use client";

import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type Offer = {
  code: string;
  label: string;
  description: string | null;
};

export function ProductOffersBanner() {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${getApiBase()}/api/coupons/offers`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: { offers?: Offer[] } }) => {
        if (!cancelled) setOffers(json.data?.offers ?? []);
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!offers.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {offers.map((offer) => (
        <div
          key={offer.code}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
        >
          <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            {offer.code}
          </span>
          <span className="font-semibold">{offer.label}</span>
          {offer.description ? (
            <span className="text-xs text-emerald-800/80">— {offer.description}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
