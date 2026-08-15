"use client";

import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type Offer = {
  code: string;
  label: string;
  description: string | null;
};

const FALLBACK_OFFER: Offer = {
  code: "WELCOME5",
  label: "5% off your first order",
  description: null
};

type Props = {
  codAvailable?: boolean;
};

/** Value + payment reassurance, shown under price so it is seen before variants. */
export function ProductOffersBanner({ codAvailable = false }: Props) {
  const [offers, setOffers] = useState<Offer[]>([FALLBACK_OFFER]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${getApiBase()}/api/coupons/offers`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: { offers?: Offer[] } }) => {
        if (cancelled) return;
        const fromApi = (json.data?.offers ?? [])
          .filter((o) => o.code !== "WELCOME10")
          .map((o) =>
            o.code === "WELCOME5" ? { ...o, label: "5% off your first order", description: null } : o
          );
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {codAvailable ? (
        <div className="flex items-center gap-3 rounded-xl border border-[#108967]/25 bg-[#e8f6f1] px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#108967] text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#108967]">Cash on delivery</p>
            <p className="text-xs text-stone-600">Pay when your order arrives</p>
          </div>
        </div>
      ) : null}

      {offers.map((offer) => (
        <div
          key={offer.code}
          className="flex items-center gap-3 rounded-xl border border-[#e2c98a] bg-[#fbf6ea] px-3.5 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-brand-ink">{offer.label}</p>
            <p className="text-xs text-stone-600">
              Use code{" "}
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-[#108967]">
                {offer.code}
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
