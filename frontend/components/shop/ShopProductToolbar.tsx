"use client";

import { useMemo } from "react";

import type { CategoryNode } from "@/lib/types";

import { ShopMobileCategoryDrawer } from "./ShopMobileCategoryDrawer";
import { ShopSearchBar } from "./ShopSearchBar";
import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  categories: CategoryNode[];
  categorySlug: string | undefined;
  searchQ: string;
  isPending: boolean;
  onSelectCategory: (slug: string | undefined) => void;
  onSearch: (term: string) => void;
  onClearCategory: () => void;
  onClearSearch: () => void;
};

export function ShopProductToolbar({
  categories,
  categorySlug,
  searchQ,
  isPending,
  onSelectCategory,
  onSearch,
  onClearCategory,
  onClearSearch
}: Props) {
  const { loaded, total } = useShopProductsMeta();

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

  return (
  <>
    <div className="lg:contents">
      <div className="fixed inset-x-0 top-24 z-40 border-b border-brand-cream-dark/60 bg-brand-cream/95 shadow-sm lg:static lg:z-auto lg:border-b-0 lg:bg-transparent lg:shadow-none">
        <div className="lg:hidden">
          <ShopMobileCategoryDrawer
            categories={categories}
            selectedSlug={categorySlug}
            onSelect={onSelectCategory}
          />
        </div>

        <div className="relative isolate z-50 px-3 pb-2 pt-0 md:px-0 lg:pb-0 lg:pt-0">
          <ShopSearchBar value={searchQ} onSearch={onSearch} />

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

      {/* Reserve space for the fixed mobile toolbar (filters + search + pills). */}
      <div className="h-[8.75rem] shrink-0 lg:hidden" aria-hidden />
    </div>
  </>
  );
}
