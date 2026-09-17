"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/order-display";
import type { OrderParcel } from "@/lib/orders-api";

/**
 * Tracking rows for an order. Orders dispatched in more than one box carry a
 * label per parcel, so the customer gets every AWB and link rather than the
 * most recent one.
 */
export function OrderParcelList({ parcels }: { parcels: OrderParcel[] }) {
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null);
  if (!parcels.length) return null;
  const multi = parcels.length > 1;

  return (
    <div className="flex flex-col gap-3">
      {multi ? (
        <p className="text-xs text-brand-muted">
          This order is travelling in <span className="font-semibold text-brand-ink">{parcels.length} parcels</span>.
          Track each one below.
        </p>
      ) : null}

      {parcels.map((parcel) => {
        const external = parcel.trackingUrl.startsWith("http");
        return (
          <div key={parcel.awb} className="flex flex-col gap-1.5">
            {multi ? (
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-muted">
                {parcel.label}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={parcel.trackingUrl}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full bg-brand-forest px-4 text-sm font-medium text-brand-cream no-underline transition-colors hover:bg-brand-night"
              >
                <span aria-hidden="true">🚚</span>
                Track package
              </a>
              <span className="flex flex-wrap items-center gap-2 text-xs text-brand-muted">
                <span>
                  via <span className="font-semibold text-brand-ink">{parcel.courier}</span>
                </span>
                <span className="font-mono text-[11px]">AWB {parcel.awb}</span>
                <button
                  type="button"
                  onClick={() => {
                    void copyToClipboard(parcel.awb).then((ok) => {
                      if (!ok) return;
                      setCopiedAwb(parcel.awb);
                      setTimeout(() => setCopiedAwb((current) => (current === parcel.awb ? null : current)), 2000);
                    });
                  }}
                  className="rounded-full border border-brand-cream-dark bg-white px-2 py-0.5 text-[10px] font-semibold text-brand-forest hover:bg-brand-cream"
                >
                  {copiedAwb === parcel.awb ? "Copied" : "Copy"}
                </button>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
