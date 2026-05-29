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
      <h2 className="display-text font-serif text-lg font-semibold text-brand-ink">Pair it with</h2>
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
              className="flex min-w-0 gap-3 rounded-lg border border-[rgba(196,176,232,0.25)] bg-white p-3 shadow-sm"
            >
              <Link
                href={`/product/${item.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-brand-violet-light"
              >
                {img ? (
                  <Image src={img} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-brand-muted">—</span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                {price ? <p className="price-text whitespace-nowrap text-sm font-semibold text-[#b85c38]">+ {price}</p> : null}
                <Link
                  href={`/product/${item.slug}`}
                  className="mt-0.5 line-clamp-2 text-sm font-medium text-brand-ink hover:text-brand-violet"
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
                    className="mt-2 inline-flex min-w-[72px] items-center justify-center rounded border border-brand-violet px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-violet hover:bg-brand-violet hover:text-white disabled:opacity-50"
                  >
                    {addingId === item.id ? "Adding…" : "Add"}
                  </button>
                ) : (
                  <Link
                    href={`/product/${item.slug}`}
                    className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-brand-violet hover:underline"
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
