"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { usePricingZone } from "@/hooks/usePricingZone";
import { unitSaleMinor, zoneToCurrency, type Zone } from "@/lib/currency";
import { formatMinorFromPaise } from "@/lib/money";
import { resolveMediaUrl } from "@/lib/media-cdn";
import type { ProductListItem } from "@/lib/types";

type Props = {
  items: ProductListItem[];
  /** Compact list for buy-box column (max 2). */
  compact?: boolean;
};

function pairWithPriceLabel(item: ProductListItem, zone: Zone): string | null {
  if (item.fromPriceInPaise == null) return null;
  const currency = zoneToCurrency(zone);
  const minor = unitSaleMinor(
    {
      saleInPaise: item.fromPriceInPaise,
      mrpInPaise: item.fromMrpInPaise ?? item.fromPriceInPaise,
      saleUsdCents: item.fromSaleUsdCents,
      mrpUsdCents: item.fromMrpUsdCents,
      saleGbpPence: item.fromSaleGbpPence,
      mrpGbpPence: item.fromMrpGbpPence
    },
    zone
  );
  return zone === "IN" ? `+${Math.round(minor / 100)}` : `+${formatMinorFromPaise(minor, currency)}`;
}

function AddButton({
  item,
  addingId,
  setAddingId,
  compact
}: {
  item: ProductListItem;
  addingId: string | null;
  setAddingId: (id: string | null) => void;
  compact?: boolean;
}) {
  if (item.defaultVariantId) {
    return (
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
        className={
          compact
            ? "shrink-0 rounded-full bg-brand-night px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            : "mt-2 inline-flex min-w-[72px] items-center justify-center rounded-full border border-brand-forest px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-forest transition-colors hover:bg-brand-forest hover:text-brand-cream disabled:opacity-50"
        }
      >
        {addingId === item.id ? "…" : "Add"}
      </button>
    );
  }

  return (
    <Link
      href={`/product/${item.slug}`}
      className={
        compact
          ? "shrink-0 rounded-full bg-brand-night px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white"
          : "mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-brand-forest hover:underline"
      }
    >
      View
    </Link>
  );
}

export function PairWithRow({ items, compact = false }: Props) {
  const zone = usePricingZone();
  const [addingId, setAddingId] = useState<string | null>(null);
  const displayItems = compact ? items.slice(0, 2) : items.slice(0, 3);

  if (displayItems.length === 0) return null;

  if (compact) {
    return (
      <section className="rounded-xl border border-brand-forest/15 bg-gradient-to-r from-[#eef7f3] to-[#faf6ee] px-3 py-2.5 shadow-[0_4px_14px_rgba(16,137,103,0.1)]">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#108967]">
          <span aria-hidden className="text-base">
            🔗
          </span>
          Pair it with
          <span aria-hidden className="text-xs">
            ✨
          </span>
        </h2>

        <ul className="mt-2 divide-y divide-brand-forest/10">
          {displayItems.map((item) => {
            const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
            const priceLabel = pairWithPriceLabel(item, zone);

            return (
              <li key={item.id} className="flex items-center gap-2.5 py-2 first:pt-1.5 last:pb-0">
                <Link
                  href={`/product/${item.slug}`}
                  className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#EDE4D3] ring-1 ring-brand-cream-dark/80"
                >
                  {img ? (
                    <Image src={img} alt={item.name} fill className="object-cover" sizes="44px" unoptimized />
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
                  {priceLabel ? (
                    <p className="mt-0.5 text-xs font-semibold tabular-nums text-brand-forest">{priceLabel}</p>
                  ) : null}
                </div>
                <AddButton item={item} addingId={addingId} setAddingId={setAddingId} compact />
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-forest/15 bg-gradient-to-br from-brand-ivory via-white to-[#f5ecd8] p-4 shadow-[0_8px_24px_rgba(16,137,103,0.1)]">
      <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold text-brand-ink">
        <span aria-hidden>🔗</span>
        Pair it with
        <span aria-hidden className="text-sm">
          ✨
        </span>
      </h2>

      <ul className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {displayItems.map((item, index) => {
          const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
          const priceLabel = pairWithPriceLabel(item, zone);

          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-stretch">
              {index > 0 ? (
                <div
                  className="mx-2 hidden w-px shrink-0 self-stretch bg-brand-forest/20 sm:block"
                  aria-hidden
                />
              ) : null}
              <div className="flex min-w-0 flex-1 gap-3 rounded-xl border border-white/80 bg-white/95 p-3 shadow-sm">
                <Link
                  href={`/product/${item.slug}`}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#EDE4D3]"
                >
                  {img ? (
                    <Image src={img} alt={item.name} fill className="object-cover" sizes="64px" unoptimized />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  {priceLabel ? (
                    <p className="text-sm font-semibold text-brand-forest">{priceLabel}</p>
                  ) : null}
                  <Link
                    href={`/product/${item.slug}`}
                    className="mt-0.5 line-clamp-2 text-sm font-medium text-brand-ink hover:text-brand-forest"
                  >
                    {item.name}
                  </Link>
                  <AddButton item={item} addingId={addingId} setAddingId={setAddingId} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
