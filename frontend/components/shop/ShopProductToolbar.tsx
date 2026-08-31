"use client";

import { useEffect, useMemo, useState } from "react";

import type { CategoryNode } from "@/lib/types";
import { shopMerchFilterLabel, SHOP_PRICE_MAX, SHOP_PRICE_MIN } from "@/lib/shop-merch-filters";

import { ShopFilterPanel, ShopFilterToggle } from "./ShopFilterPanel";
import { ShopMobileCategoryDrawer } from "./ShopMobileCategoryDrawer";
import { ShopSearchBar } from "./ShopSearchBar";
import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  categories: CategoryNode[];
  categorySlug: string | undefined;
  searchQ: string;
  tag: string;
  minPrice: number;
  maxPrice: number;
  isPending: boolean;
  onSelectCategory: (slug: string | undefined) => void;
  onSearch: (term: string) => void;
  onTagChange: (tag: string | undefined) => void;
  onPriceChange: (min: number, max: number) => void;
  onClearCategory: () => void;
  onClearSearch: () => void;
  onClearTag: () => void;
  onClearPrice: () => void;
};

export function ShopProductToolbar({
  categories,
  categorySlug,
  searchQ,
  tag,
  minPrice,
  maxPrice,
  isPending,
  onSelectCategory,
  onSearch,
  onTagChange,
  onPriceChange,
  onClearCategory,
  onClearSearch,
  onClearTag,
  onClearPrice
}: Props) {
  const { loaded, total } = useShopProductsMeta();
  const [filterOpen, setFilterOpen] = useState(false);
  const [localTag, setLocalTag] = useState(tag);
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);
  const [localSearch, setLocalSearch] = useState(searchQ);

  useEffect(() => {
    setLocalTag(tag);
  }, [tag]);
  useEffect(() => {
    setLocalMin(minPrice);
    setLocalMax(maxPrice);
  }, [minPrice, maxPrice]);
  useEffect(() => {
    setLocalSearch(searchQ);
  }, [searchQ]);

  const activeCategoryName = useMemo(() => {
    if (!categorySlug) return null;
    const walk = (nodes: CategoryNode[]): string | null => {
      for (const node of nodes) {
        if (node.slug === categorySlug) return node.name;
        if (node.children.length) {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(categories) ?? categorySlug;
  }, [categories, categorySlug]);

  const tagLabel = shopMerchFilterLabel(localTag);
  const priceActive = localMin > SHOP_PRICE_MIN || localMax < SHOP_PRICE_MAX;

  function applyTag(next: string | undefined) {
    setLocalTag(next ?? "");
    setFilterOpen(false);
    onTagChange(next);
  }

  function applyPrice(nextMin: number, nextMax: number) {
    setLocalMin(nextMin);
    setLocalMax(nextMax);
    onPriceChange(nextMin, nextMax);
  }

  function removeTag() {
    setLocalTag("");
    onClearTag();
  }

  function removePrice() {
    setLocalMin(SHOP_PRICE_MIN);
    setLocalMax(SHOP_PRICE_MAX);
    onClearPrice();
  }

  function removeSearch() {
    setLocalSearch("");
    onClearSearch();
  }

  return (
    <>
      <div className="lg:contents">
        <div className="sticky top-[var(--storefront-header-live-offset)] z-40 overflow-visible border-b border-brand-cream-dark/60 bg-brand-cream/95 backdrop-blur-sm supports-[backdrop-filter]:bg-brand-cream/90 lg:border-b-0 lg:bg-brand-cream/95">
          <div className="lg:hidden">
            <ShopMobileCategoryDrawer
              categories={categories}
              selectedSlug={categorySlug}
              onSelect={onSelectCategory}
            />
          </div>

          <div className="relative px-3 py-1.5 md:px-0 lg:py-0">
            <div className="relative">
              <div className="relative z-[41] flex items-center gap-1.5">
                <ShopSearchBar
                  value={searchQ}
                  onSearch={(term) => {
                    setLocalSearch(term.trim());
                    onSearch(term);
                  }}
                />
                <ShopFilterToggle open={filterOpen} onOpenChange={setFilterOpen} />
              </div>
              {filterOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[39] bg-black/30 lg:hidden"
                    aria-label="Close filters"
                    onClick={() => setFilterOpen(false)}
                  />
                  <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[min(70vh,32rem)] overflow-y-auto rounded-xl border border-brand-cream-dark bg-brand-cream shadow-[0_18px_40px_rgba(0,0,0,0.12)] lg:hidden">
                    <ShopFilterPanel
                      tag={localTag}
                      minPrice={localMin}
                      maxPrice={localMax}
                      open={filterOpen}
                      onTagChange={applyTag}
                      onPriceChange={applyPrice}
                      onClose={() => setFilterOpen(false)}
                      className="!mt-0"
                    />
                  </div>
                </>
              ) : null}
            </div>
            <div className="hidden lg:block">
              <ShopFilterPanel
                tag={localTag}
                minPrice={localMin}
                maxPrice={localMax}
                open={filterOpen}
                onTagChange={applyTag}
                onPriceChange={applyPrice}
                onClose={() => setFilterOpen(false)}
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {categorySlug ? (
                  <button
                    type="button"
                    onClick={onClearCategory}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    {activeCategoryName}
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Remove category filter</span>
                  </button>
                ) : null}
                {localSearch ? (
                  <button
                    type="button"
                    onClick={removeSearch}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    &ldquo;{localSearch}&rdquo;
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Clear search</span>
                  </button>
                ) : null}
                {tagLabel ? (
                  <button
                    type="button"
                    onClick={removeTag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    {tagLabel}
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Remove tag filter</span>
                  </button>
                ) : null}
                {priceActive ? (
                  <button
                    type="button"
                    onClick={removePrice}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    ₹{localMin}–₹{localMax}
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Remove price filter</span>
                  </button>
                ) : null}
              </div>

              <p className="text-xs text-brand-muted">
                {isPending ? (
                  "Updating…"
                ) : total > 0 ? (
                  <>
                    <span className="font-medium text-brand-ink">{loaded}</span> of{" "}
                    <span className="font-medium text-brand-ink">{total}</span> products
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
