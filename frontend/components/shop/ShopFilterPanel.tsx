"use client";

import { useEffect, useId, useRef, useState } from "react";

import { SHOP_MERCH_FILTERS, SHOP_PRICE_MAX, SHOP_PRICE_MIN } from "@/lib/shop-merch-filters";

type Props = {
  tag: string;
  minPrice: number;
  maxPrice: number;
  open: boolean;
  onTagChange: (tag: string | undefined) => void;
  onPriceChange: (min: number, max: number) => void;
  onClose?: () => void;
  className?: string;
};

const PLAIN_GREEN_PILL =
  "inline-flex h-8 min-h-[32px] shrink-0 items-center justify-center gap-1 rounded-full bg-[#166D46] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#145a3a]";

export function ShopFilterToggle({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      className={`${PLAIN_GREEN_PILL} ${open ? "bg-[#145a3a]" : ""}`}
      aria-expanded={open}
    >
      Filter
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
        <path
          d="M4 7h16M7 12h10M10 17h4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function ShopFilterPanel({
  tag,
  minPrice,
  maxPrice,
  open,
  onTagChange,
  onPriceChange,
  onClose,
  className
}: Props) {
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);
  const debounceRef = useRef<number | undefined>(undefined);
  const minId = useId();
  const maxId = useId();

  useEffect(() => {
    setLocalMin(minPrice);
    setLocalMax(maxPrice);
  }, [minPrice, maxPrice]);

  function commitPrice(nextMin: number, nextMax: number) {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onPriceChange(nextMin, nextMax);
    }, 250);
  }

  function handleMin(next: number) {
    const min = Math.min(next, localMax);
    setLocalMin(min);
    commitPrice(min, localMax);
  }

  function handleMax(next: number) {
    const max = Math.max(next, localMin);
    setLocalMax(max);
    commitPrice(localMin, max);
  }

  const span = SHOP_PRICE_MAX - SHOP_PRICE_MIN || 1;
  const leftPct = ((localMin - SHOP_PRICE_MIN) / span) * 100;
  const widthPct = ((localMax - localMin) / span) * 100;

  if (!open) return null;

  return (
    <div className={`relative mt-3 rounded-xl bg-[#019875]/30 px-3 py-4 md:px-5 ${className ?? ""}`}>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-ink shadow-sm ring-1 ring-black/10 transition-colors hover:bg-brand-cream"
          aria-label="Close filters"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
      <ul className="flex flex-wrap items-center gap-2 pr-10">
        {SHOP_MERCH_FILTERS.map((chip) => {
          const active = tag === chip.slug;
          return (
            <li key={chip.slug}>
              <button
                type="button"
                onClick={() => {
                  onTagChange(active ? undefined : chip.slug);
                  onClose?.();
                }}
                className="relative rounded-lg py-2 pl-9 pr-4 text-sm font-medium shadow-sm transition-colors md:text-base"
                style={{
                  border: `1px solid ${chip.border}`,
                  backgroundColor: active ? chip.dot : "#fff",
                  color: active ? "#fff" : "#212529"
                }}
              >
                <span
                  className="absolute left-3.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: active ? "#fff" : chip.dot }}
                  aria-hidden
                />
                {chip.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="shop-price-range mt-8 md:mt-10">
        <h3 className="mb-6 text-lg font-semibold text-[#212529]">Price Range</h3>
        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#d7efe8]" />
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#019875]"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          />
          <label htmlFor={minId} className="sr-only">
            Minimum price
          </label>
          <input
            id={minId}
            type="range"
            min={SHOP_PRICE_MIN}
            max={SHOP_PRICE_MAX}
            step={10}
            value={localMin}
            onChange={(e) => handleMin(Number(e.target.value))}
            className="shop-price-thumb shop-price-thumb-min"
          />
          <label htmlFor={maxId} className="sr-only">
            Maximum price
          </label>
          <input
            id={maxId}
            type="range"
            min={SHOP_PRICE_MIN}
            max={SHOP_PRICE_MAX}
            step={10}
            value={localMax}
            onChange={(e) => handleMax(Number(e.target.value))}
            className="shop-price-thumb shop-price-thumb-max"
          />
        </div>
        <div className="mt-2 flex justify-between text-sm text-brand-ink">
          <span>₹{localMin}</span>
          <span>₹{localMax}</span>
        </div>
      </div>
    </div>
  );
}
