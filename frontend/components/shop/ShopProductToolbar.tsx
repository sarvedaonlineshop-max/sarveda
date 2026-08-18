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
  onClearTag
}: Props) {
  const { loaded, total } = useShopProductsMeta();
  const [filterOpen, setFilterOpen] = useState(
    Boolean(tag) || minPrice > SHOP_PRICE_MIN || maxPrice < SHOP_PRICE_MAX
  );

  useEffect(() => {
    if (tag || minPrice > SHOP_PRICE_MIN || maxPrice < SHOP_PRICE_MAX) {
      setFilterOpen(true);
    }
  }, [tag, minPrice, maxPrice]);

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

  const tagLabel = shopMerchFilterLabel(tag);

  return (
    <>
      <div className="lg:contents">
        <div className="fixed inset-x-0 top-[var(--storefront-header-live-offset)] z-40 border-b border-brand-cream-dark/60 bg-brand-cream/95 lg:static lg:z-auto lg:border-b-0 lg:bg-transparent">
          <div className="lg:hidden">
            <ShopMobileCategoryDrawer
              categories={categories}
              selectedSlug={categorySlug}
              onSelect={onSelectCategory}
            />
          </div>

          <div className="relative px-3 py-1.5 md:px-0 lg:py-0">
            <div className="flex items-center gap-2">
              <ShopSearchBar value={searchQ} onSearch={onSearch} />
              <ShopFilterToggle open={filterOpen} onOpenChange={setFilterOpen} />
            </div>
            <div className="hidden lg:block">
              <ShopFilterPanel
                tag={tag}
                minPrice={minPrice}
                maxPrice={maxPrice}
                open={filterOpen}
                onTagChange={onTagChange}
                onPriceChange={onPriceChange}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
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
                {searchQ ? (
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    &ldquo;{searchQ}&rdquo;
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Clear search</span>
                  </button>
                ) : null}
                {tagLabel ? (
                  <button
                    type="button"
                    onClick={onClearTag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-forest/25 bg-white px-3 py-1 text-xs font-medium text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
                  >
                    {tagLabel}
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                    <span className="sr-only">Remove tag filter</span>
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

        <div className="h-[5.25rem] shrink-0 lg:hidden" aria-hidden />
      </div>

      <div className="px-3 lg:hidden">
        <ShopFilterPanel
          tag={tag}
          minPrice={minPrice}
          maxPrice={maxPrice}
          open={filterOpen}
          onTagChange={onTagChange}
          onPriceChange={onPriceChange}
        />
      </div>
    </>
  );
}
