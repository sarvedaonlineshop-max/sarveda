"use client";

import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type Offer = {
  code: string;
  label: string;
  description: string | null;
};

/** Shown when API has no active featured coupon yet (e.g. migration pending). */
const FALLBACK_OFFER: Offer = {
  code: "WELCOME5",
  label: "5% off",
  description: null
};

export function ProductOffersBanner() {
  const [offers, setOffers] = useState<Offer[]>([FALLBACK_OFFER]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${getApiBase()}/api/coupons/offers`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: { offers?: Offer[] } }) => {
        if (cancelled) return;
        const fromApi = (json.data?.offers ?? []).filter((o) => o.code !== "WELCOME10");
        setOffers(fromApi.length ? fromApi : [FALLBACK_OFFER]);
      })
      .catch(() => {
        if (!cancelled) setOffers([FALLBACK_OFFER]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {offers.map((offer) => (
        <div
          key={offer.code}
          className="inline-flex items-center gap-2 rounded-xl border border-brand-gold/40 bg-brand-cream px-3 py-2 text-sm text-brand-ink"
        >
          <span className="rounded-full border border-brand-cream-dark bg-brand-ivory px-2 py-0.5 font-mono text-xs font-semibold text-brand-forest">
            {offer.code}
          </span>
          <span className="font-semibold">{offer.label}</span>
          {offer.description ? (
            <span className="text-xs text-brand-muted">— {offer.description}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
