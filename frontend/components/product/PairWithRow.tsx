"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { readZoneFromCookie, type Zone, zoneToCurrency } from "@/lib/currency";
import { formatMinorFromPaise } from "@/lib/money";
import { resolveMediaUrl } from "@/lib/media-cdn";
import type { ProductListItem } from "@/lib/types";

type Props = {
  items: ProductListItem[];
};

export function PairWithRow({ items }: Props) {
  const [zone, setZone] = useState<Zone>("IN");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    setZone(readZoneFromCookie());
  }, []);

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="font-serif text-lg font-semibold text-stone-900">Pair it with</h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((item) => {
          const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
          const currency = zoneToCurrency(zone);
          const price =
            item.fromPriceInPaise != null
              ? formatMinorFromPaise(item.fromPriceInPaise, currency)
              : null;

          return (
            <li
              key={item.id}
              className="flex gap-3 rounded-lg border border-stone-100 bg-white p-3 shadow-sm"
            >
              <Link
                href={`/product/${item.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100"
              >
                {img ? (
                  <Image src={img} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                {price ? <p className="text-sm font-semibold text-[#b85c38]">+{price}</p> : null}
                <Link
                  href={`/product/${item.slug}`}
                  className="mt-0.5 line-clamp-2 text-sm font-medium text-stone-800 hover:text-[#108967]"
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
                    className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#108967] hover:underline disabled:opacity-50"
                  >
                    {addingId === item.id ? "Adding…" : "Add"}
                  </button>
                ) : (
                  <Link
                    href={`/product/${item.slug}`}
                    className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-[#108967] hover:underline"
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
