"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useState } from "react";

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

function PairWithHeader({ compact }: { compact?: boolean }) {
  return (
    <div className="relative flex items-start gap-2.5">
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-brand-forest/15 text-brand-forest shadow-sm ring-1 ring-brand-forest/20 ${
          compact ? "h-9 w-9 text-lg" : "h-10 w-10 text-xl"
        }`}
        aria-hidden
      >
        🔗
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className={`font-serif font-semibold text-brand-ink ${compact ? "text-base" : "text-lg"}`}>
            Pair it with
          </h2>
          <span className="text-sm" aria-hidden>
            ✨
          </span>
        </div>
        <p className="mt-0.5 text-xs text-brand-muted">Hand-picked add-ons for your setup</p>
      </div>
    </div>
  );
}

function ProductSeparator() {
  return (
    <li className="flex w-9 shrink-0 flex-col items-center justify-center self-stretch px-0.5" aria-hidden>
      <div className="min-h-[28px] flex-1 w-px bg-gradient-to-b from-transparent via-brand-forest/35 to-transparent" />
      <span className="my-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-forest shadow-md ring-1 ring-brand-forest/15">
        +
      </span>
      <div className="min-h-[28px] flex-1 w-px bg-gradient-to-b from-transparent via-brand-forest/35 to-transparent" />
    </li>
  );
}

export function PairWithRow({ items, compact = false }: Props) {
  const zone = usePricingZone();
  const [addingId, setAddingId] = useState<string | null>(null);
  const displayItems = compact ? items.slice(0, 2) : items.slice(0, 3);

  if (displayItems.length === 0) return null;

  if (compact) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-brand-forest/20 bg-gradient-to-br from-[#e8f5f0] via-brand-ivory to-[#f5ecd8] p-4 shadow-[0_10px_32px_rgba(16,137,103,0.14)]">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-gold/25 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-brand-forest/10 blur-2xl"
          aria-hidden
        />

        <PairWithHeader compact />

        <ul className="relative mt-4 flex items-stretch">
          {displayItems.map((item, index) => {
            const img = resolveMediaUrl(item.primaryImageUrl) ?? item.primaryImageUrl;
            const priceLabel = pairWithPriceLabel(item, zone);

            return (
              <Fragment key={item.id}>
                {index > 0 ? <ProductSeparator /> : null}
                <li className="min-w-0 flex-1">
                  <Link
                    href={`/product/${item.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-white/70 bg-white/90 p-2.5 text-center shadow-sm ring-1 ring-brand-forest/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-forest/20 hover:shadow-[0_8px_24px_rgba(16,137,103,0.18)]"
                  >
                    <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-[#EDE4D3] ring-1 ring-brand-cream-dark/80">
                      {img ? (
                        <Image
                          src={img}
                          alt={item.name}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 38vw, 160px"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                      )}
                    </div>
                    {priceLabel ? (
                      <p className="mt-2 inline-flex items-center justify-center gap-1 self-center rounded-full bg-brand-forest/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-brand-forest">
                        <span aria-hidden>🏷️</span>
                        {priceLabel}
                      </p>
                    ) : null}
                    <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-brand-ink group-hover:text-brand-forest">
                      {item.name}
                    </p>
                    <span className="mt-2 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-brand-muted transition-colors group-hover:text-brand-forest">
                      View details
                      <span aria-hidden>→</span>
                    </span>
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-forest/15 bg-gradient-to-br from-brand-ivory via-white to-[#f5ecd8] p-5 shadow-[0_12px_40px_rgba(16,137,103,0.1)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-brand-gold/20 blur-2xl" aria-hidden />

      <PairWithHeader />

      <ul className="relative mt-5 flex flex-col gap-4 sm:flex-row sm:items-stretch">
        {displayItems.map((item, index) => {
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
            <Fragment key={item.id}>
              {index > 0 ? (
                <li className="hidden sm:flex sm:w-10 sm:shrink-0 sm:flex-col sm:items-center sm:justify-center" aria-hidden>
                  <div className="min-h-[24px] flex-1 w-px bg-gradient-to-b from-transparent via-brand-forest/30 to-transparent" />
                  <span className="my-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-forest shadow-md ring-1 ring-brand-forest/15">
                    +
                  </span>
                  <div className="min-h-[24px] flex-1 w-px bg-gradient-to-b from-transparent via-brand-forest/30 to-transparent" />
                </li>
              ) : null}
              <li className="flex min-w-0 flex-1 gap-3 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-sm ring-1 ring-brand-forest/5 transition-shadow hover:shadow-[0_8px_24px_rgba(16,137,103,0.14)]">
                <Link
                  href={`/product/${item.slug}`}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#EDE4D3] ring-1 ring-brand-cream-dark/80"
                >
                  {img ? (
                    <Image src={img} alt={item.name} fill className="object-cover" sizes="80px" unoptimized />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-stone-400">—</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  {price ? (
                    <p className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-forest/10 px-2 py-0.5 text-sm font-semibold text-brand-forest">
                      <span aria-hidden>🏷️</span>+ {price}
                    </p>
                  ) : null}
                  <Link
                    href={`/product/${item.slug}`}
                    className="mt-1 line-clamp-2 font-sans text-sm font-medium text-brand-ink hover:text-brand-forest"
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
                      className="mt-2 inline-flex min-w-[72px] items-center justify-center gap-1 rounded-full border border-brand-forest px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-forest transition-colors hover:bg-brand-forest hover:text-brand-cream disabled:opacity-50"
                    >
                      <span aria-hidden>🛒</span>
                      {addingId === item.id ? "Adding…" : "Add"}
                    </button>
                  ) : (
                    <Link
                      href={`/product/${item.slug}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-forest hover:underline"
                    >
                      View <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}
