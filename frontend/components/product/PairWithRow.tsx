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
      <section>
        <h2 className="text-base font-semibold text-brand-ink">Pair it with</h2>
        <ul className="mt-3 grid grid-cols-2 gap-4">
          {displayItems.map((item) => {
            const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
            const currency = zoneToCurrency(zone);
            const minor =
              item.fromPriceInPaise != null
                ? unitSaleMinor(
                    {
                      saleInPaise: item.fromPriceInPaise,
                      mrpInPaise: item.fromMrpInPaise ?? item.fromPriceInPaise,
                      saleUsdCents: item.fromSaleUsdCents,
                      mrpUsdCents: item.fromMrpUsdCents,
                      saleGbpPence: item.fromSaleGbpPence,
                      mrpGbpPence: item.fromMrpGbpPence
                    },
                    zone
                  )
                : null;
            const priceLabel =
              minor != null
                ? zone === "IN"
                  ? `+${Math.round(minor / 100)}`
                  : `+${formatMinorFromPaise(minor, currency)}`
                : null;

            return (
              <li key={item.id} className="min-w-0 text-center">
                <Link href={`/product/${item.slug}`} className="group block">
                  <div className="relative mx-auto aspect-square w-full overflow-hidden bg-[#EDE4D3]">
                    {img ? (
                      <Image
                        src={img}
                        alt={item.name}
                        fill
                        className="object-cover transition-opacity group-hover:opacity-90"
                        sizes="(max-width: 640px) 40vw, 180px"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                    )}
                  </div>
                  {priceLabel ? (
                    <p className="mt-2 text-sm font-semibold text-brand-ink">{priceLabel}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-brand-ink group-hover:text-brand-forest">
                    {item.name}
                  </p>
                </Link>
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
                  className="mt-0.5 line-clamp-2 font-sans text-sm font-medium text-brand-ink hover:text-brand-forest"
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
