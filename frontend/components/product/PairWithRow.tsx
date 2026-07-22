"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { usePricingZone } from "@/hooks/usePricingZone";
import { unitSaleMinor, zoneToCurrency } from "@/lib/currency";
import { formatMinorFromPaise } from "@/lib/money";
import { resolveMediaUrl } from "@/lib/media-cdn";
import type { ProductListItem } from "@/lib/types";

type Props = {
  items: ProductListItem[];
  /** Compact list for buy-box column (max 2). */
  compact?: boolean;
};

export function PairWithRow({ items, compact = false }: Props) {
  const zone = usePricingZone();
  const [addingId, setAddingId] = useState<string | null>(null);
  const displayItems = compact ? items.slice(0, 2) : items.slice(0, 3);

  if (displayItems.length === 0) return null;

  if (compact) {
    return (
      <section className="rounded-xl border border-brand-cream-dark/80 bg-brand-ivory/60 p-3">
        <h2 className="font-serif text-base font-semibold text-brand-ink">Complete Your Journey</h2>
        <ul className="mt-2.5 space-y-2">
          {displayItems.map((item) => {
            const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
            const currency = zoneToCurrency(zone);
            const price =
              item.fromPriceInPaise != null
                ? formatMinorFromPaise(
                    unitSaleMinor(
                      {
                        saleInPaise: item.fromPriceInPaise,
                        mrpInPaise: item.fromMrpInPaise ?? item.fromPriceInPaise,
                        saleUsdCents: item.fromSaleUsdCents,
                        mrpUsdCents: item.fromMrpUsdCents,
                        saleGbpPence: item.fromSaleGbpPence,
                        mrpGbpPence: item.fromMrpGbpPence
                      },
                      zone
                    ),
                    currency
                  )
                : null;

            return (
              <li key={item.id} className="flex items-center gap-2.5">
                <Link
                  href={`/product/${item.slug}`}
                  className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[#EDE4D3]"
                >
                  {img ? (
                    <Image src={img} alt={item.name} fill className="object-cover" sizes="48px" unoptimized />
                  ) : (
                    <span className="flex h-full items-center justify-center text-[10px] text-stone-400">—</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${item.slug}`}
                    className="line-clamp-1 text-sm font-medium text-brand-ink hover:text-brand-forest"
                  >
                    {item.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-0.5 text-[10px] text-brand-gold" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                  {price ? (
                    <p className="mt-0.5 text-sm font-semibold text-brand-ink">{price}</p>
                  ) : null}
                </div>
                {item.defaultVariantId ? (
                  <button
                    type="button"
                    disabled={addingId === item.id}
                    onClick={() => {
                      setAddingId(item.id);
                      void cartAdd(item.defaultVariantId!, 1)
                        .catch((err) => {
                          alert(err instanceof Error ? err.message : "Could not add to cart");
                        })
                        .finally(() => setAddingId(null));
                    }}
                    className="shrink-0 rounded-full bg-brand-night px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {addingId === item.id ? "…" : "Add"}
                  </button>
                ) : (
                  <Link
                    href={`/product/${item.slug}`}
                    className="shrink-0 rounded-full bg-brand-night px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                  >
                    View
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Complete your journey</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-brand-ink">You may also like</h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {displayItems.map((item) => {
          const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
          const currency = zoneToCurrency(zone);
          const price =
            item.fromPriceInPaise != null
              ? formatMinorFromPaise(
                  unitSaleMinor(
                    {
                      saleInPaise: item.fromPriceInPaise,
                      mrpInPaise: item.fromMrpInPaise ?? item.fromPriceInPaise,
                      saleUsdCents: item.fromSaleUsdCents,
                      mrpUsdCents: item.fromMrpUsdCents,
                      saleGbpPence: item.fromSaleGbpPence,
                      mrpGbpPence: item.fromMrpGbpPence
                    },
                    zone
                  ),
                  currency
                )
              : null;

          return (
            <li
              key={item.id}
              className="flex min-w-0 gap-3 rounded-2xl border border-brand-cream-dark bg-brand-ivory p-3 shadow-card"
            >
              <Link
                href={`/product/${item.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#EDE4D3]"
              >
                {img ? (
                  <Image src={img} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                {price ? <p className="whitespace-nowrap text-sm font-semibold text-brand-forest">+ {price}</p> : null}
                <Link
                  href={`/product/${item.slug}`}
                  className="mt-0.5 line-clamp-2 font-serif text-sm font-medium text-brand-ink hover:text-brand-forest"
                >
                  {item.name}
                </Link>
                {item.defaultVariantId ? (
                  <button
                    type="button"
                    disabled={addingId === item.id}
                    onClick={() => {
                      setAddingId(item.id);
                      void cartAdd(item.defaultVariantId!, 1)
                        .catch((err) => {
                          alert(err instanceof Error ? err.message : "Could not add to cart");
                        })
                        .finally(() => setAddingId(null));
                    }}
                    className="mt-2 inline-flex min-w-[72px] items-center justify-center rounded-full border border-brand-forest px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-forest transition-colors hover:bg-brand-forest hover:text-brand-cream disabled:opacity-50"
                  >
                    {addingId === item.id ? "Adding…" : "Add"}
                  </button>
                ) : (
                  <Link
                    href={`/product/${item.slug}`}
                    className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-brand-forest hover:underline"
                  >
                    View
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
