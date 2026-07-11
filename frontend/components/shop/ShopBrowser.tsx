"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CategoryNode } from "@/lib/types";
import { fetchShopProductsPage, type ShopProductsPage } from "@/lib/shop-products-client";

import { ShopCategoryFilterSidebar } from "./ShopCategoryFilterSidebar";
import { ShopInfiniteProductGrid } from "./ShopInfiniteProductGrid";
import { ShopMobileCategoryDrawer } from "./ShopMobileCategoryDrawer";
import { ShopSearchBar } from "./ShopSearchBar";

const PAGE_SIZE = 48;

type Props = {
  categories: CategoryNode[];
  initialCategorySlug: string | undefined;
  initialSearchQ: string | undefined;
  initialProducts: ShopProductsPage;
};

/** Flat slug → display name lookup, used for the active-filter pill and document title. */
function buildCategoryNameLookup(nodes: CategoryNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      map.set(node.slug, node.name);
      if (node.children.length) walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

function pathForSelection(slug: string | undefined): string {
  return slug ? `/product-category/${encodeURIComponent(slug)}` : "/shop";
}

function buildHref(slug: string | undefined, searchQ: string | undefined): string {
  const base = pathForSelection(slug);
  const q = searchQ?.trim();
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}

export function ShopBrowser({
  categories,
  initialCategorySlug,
  initialSearchQ,
  initialProducts
}: Props) {
  const categoryNames = useMemo(() => buildCategoryNameLookup(categories), [categories]);

  const [categorySlug, setCategorySlug] = useState(initialCategorySlug);
  const [searchQ, setSearchQ] = useState(initialSearchQ ?? "");
  const [products, setProducts] = useState<ShopProductsPage>(initialProducts);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const runFetch = useCallback(
    async (nextSlug: string | undefined, nextSearchQ: string, pushUrl: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const data = await fetchShopProductsPage({
          page: 1,
          limit: PAGE_SIZE,
          categorySlug: nextSlug,
          searchQ: nextSearchQ.trim() || undefined
        });
        if (id !== requestId.current) return; // a newer request superseded this one
        setProducts(data);
        setCategorySlug(nextSlug);
        setSearchQ(nextSearchQ);
        if (pushUrl && typeof window !== "undefined") {
          window.history.pushState(null, "", buildHref(nextSlug, nextSearchQ));
          document.title = nextSlug
            ? `${categoryNames.get(nextSlug) ?? "Shop"} | Sarveda`
            : "Shop | Sarveda";
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [categoryNames]
  );

  const handleSelectCategory = useCallback(
    (slug: string | undefined) => {
      if (slug === categorySlug) return;
      void runFetch(slug, searchQ, true);
    },
    [categorySlug, searchQ, runFetch]
  );

  const handleSearch = useCallback(
    (term: string) => {
      void runFetch(categorySlug, term, true);
    },
    [categorySlug, runFetch]
  );

  const clearCategory = useCallback(() => void runFetch(undefined, searchQ, true), [runFetch, searchQ]);
  const clearSearch = useCallback(() => void runFetch(categorySlug, "", true), [runFetch, categorySlug]);

  // Back/forward browser navigation — re-sync from the URL bar.
  useEffect(() => {
    function onPopState() {
      const path = window.location.pathname;
      const nextSlug = path.startsWith("/product-category/")
        ? decodeURIComponent(path.replace("/product-category/", "").split("/")[0] ?? "")
        : undefined;
      const nextQ = new URLSearchParams(window.location.search).get("q") ?? "";
      void runFetch(nextSlug || undefined, nextQ, false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [runFetch]);

  const activeCategoryName = categorySlug ? categoryNames.get(categorySlug) ?? categorySlug : null;

  return (
    <main className="mx-auto max-w-7xl pb-16 pt-4 md:px-4 md:pb-0 md:pt-0 lg:px-8">
      <h1 className="sr-only">{activeCategoryName ?? "Shop"}</h1>
      <ShopMobileCategoryDrawer
        categories={categories}
        selectedSlug={categorySlug}
        onSelect={handleSelectCategory}
      />

      {/* Below lg: normal page scroll, toolbar stays sticky as the page moves.
          At lg+: a fixed app shell — this row is bounded to the viewport (minus
          the pinned announcement bar + header + slim footer), so only the
          sidebar and product grid scroll internally; header/toolbar never move. */}
      <div className="flex flex-col lg:h-[calc(100dvh-140px)] lg:flex-row lg:items-stretch lg:gap-10 lg:py-6">
        <div className="hidden lg:flex lg:h-full lg:w-72 lg:flex-shrink-0 lg:flex-col lg:overflow-hidden">
          <ShopCategoryFilterSidebar
            categories={categories}
            selectedSlug={categorySlug}
            onSelect={handleSelectCategory}
          />
        </div>

        <div className="min-w-0 flex-1 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
          {/* Toolbar: sticky while the mobile page scrolls; a fixed, non-scrolling
              header of the column once the lg+ shell takes over. */}
          <div className="sticky top-16 z-30 border-b border-brand-cream-dark/60 bg-brand-cream/95 px-3 pb-2 pt-2 backdrop-blur md:top-24 md:rounded-t-2xl md:px-0 lg:static lg:top-auto lg:shrink-0 lg:z-auto">
            <ShopSearchBar value={searchQ} onSearch={handleSearch} />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {categorySlug ? (
                  <button
                    type="button"
                    onClick={clearCategory}
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
                    onClick={clearSearch}
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
                {loading ? (
                  "Updating…"
                ) : (
                  <>
                    <span className="font-medium text-brand-ink">{products.items.length}</span> of{" "}
                    <span className="font-medium text-brand-ink">{products.total}</span> products
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="pt-3 lg:flex-1 lg:overflow-y-auto lg:pb-8 lg:pt-4">
            <ShopInfiniteProductGrid
              initialItems={products.items}
              initialPage={products.page}
              totalPages={products.totalPages}
              total={products.total}
              categorySlug={categorySlug}
              searchQ={searchQ || undefined}
              hideSummary
            />
          </div>
        </div>
      </div>
    </main>
  );
}
