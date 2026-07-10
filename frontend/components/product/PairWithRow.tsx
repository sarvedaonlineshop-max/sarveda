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
};

export function PairWithRow({ items }: Props) {
  const zone = usePricingZone();
  const [addingId, setAddingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Complete the ritual</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-brand-ink">Pair it with</h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((item) => {
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
