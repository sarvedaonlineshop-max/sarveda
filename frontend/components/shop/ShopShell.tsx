"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

import type { CategoryNode } from "@/lib/types";
import { categorySlugFromPathname, type ShopBrowseQuery } from "@/lib/shop-navigation";
import { SHOP_PRICE_MAX, SHOP_PRICE_MIN } from "@/lib/shop-merch-filters";
import { currentShopPath, readShopScroll } from "@/lib/shop-scroll-restore";

import { ShopCategoriesProvider } from "./ShopCategoriesContext";
import { ShopCategoryFilterSidebar } from "./ShopCategoryFilterSidebar";
import { ShopProductToolbar } from "./ShopProductToolbar";
import { ShopProductsMetaProvider } from "./ShopProductsMetaContext";
import { useShopBrowseQuery } from "./useShopBrowseQuery";
import { useShopNavigate } from "./useShopNavigate";

type Props = {
  categories: CategoryNode[];
  children: React.ReactNode;
};

function scrollProductsToTop(anchor: HTMLElement | null) {
  if (!anchor) return;
  const headerOffset = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--storefront-header-live-offset")
  );
  const extra = window.matchMedia("(min-width: 1024px)").matches ? 12 : 8;
  const top = anchor.getBoundingClientRect().top + window.scrollY - headerOffset - extra;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

/**
 * Persistent shop chrome. Avoid Suspense around server `children` and avoid
 * `useSearchParams` here — both caused soft-nav to hang on blank/skeleton /shop.
 */
export function ShopShell({ categories, children }: Props) {
  const pathname = usePathname();
  const { navigate, isPending } = useShopNavigate();
  const browseQuery = useShopBrowseQuery();
  const productsAnchorRef = useRef<HTMLDivElement>(null);
  const skipScrollToGridRef = useRef(false);

  const categorySlug = categorySlugFromPathname(pathname);
  const searchQ = browseQuery.q ?? "";
  const tag = browseQuery.tag ?? "";
  const minPrice = browseQuery.minPrice ?? SHOP_PRICE_MIN;
  const maxPrice = browseQuery.maxPrice ?? SHOP_PRICE_MAX;

  const currentQuery = useCallback(
    (overrides: ShopBrowseQuery = {}): ShopBrowseQuery => ({
      q: overrides.q !== undefined ? overrides.q : searchQ,
      tag: overrides.tag !== undefined ? overrides.tag : tag,
      minPrice: overrides.minPrice !== undefined ? overrides.minPrice : minPrice,
      maxPrice: overrides.maxPrice !== undefined ? overrides.maxPrice : maxPrice
    }),
    [searchQ, tag, minPrice, maxPrice]
  );

  const handleSelectCategory = useCallback(
    (slug: string | undefined) => {
      if (slug === categorySlug) return;
      navigate(slug, currentQuery());
    },
    [categorySlug, navigate, currentQuery]
  );

  const handleSearch = useCallback(
    (term: string) => {
      if (term.trim() === searchQ.trim()) return;
      navigate(categorySlug, currentQuery({ q: term }));
    },
    [categorySlug, navigate, currentQuery, searchQ]
  );

  const handleTagChange = useCallback(
    (nextTag: string | undefined) => {
      navigate(categorySlug, currentQuery({ tag: nextTag ?? "" }));
    },
    [categorySlug, navigate, currentQuery]
  );

  const handlePriceChange = useCallback(
    (nextMin: number, nextMax: number) => {
      if (nextMin === minPrice && nextMax === maxPrice) return;
      navigate(categorySlug, currentQuery({ minPrice: nextMin, maxPrice: nextMax }));
    },
    [categorySlug, navigate, currentQuery, minPrice, maxPrice]
  );

  const clearCategory = useCallback(
    () => navigate(undefined, currentQuery()),
    [navigate, currentQuery]
  );
  const clearSearch = useCallback(
    () => navigate(categorySlug, currentQuery({ q: "" })),
    [navigate, categorySlug, currentQuery]
  );
  const clearTag = useCallback(
    () => navigate(categorySlug, currentQuery({ tag: "" })),
    [navigate, categorySlug, currentQuery]
  );
  const clearPrice = useCallback(
    () => navigate(categorySlug, currentQuery({ minPrice: SHOP_PRICE_MIN, maxPrice: SHOP_PRICE_MAX })),
    [navigate, categorySlug, currentQuery]
  );

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

  /** When returning from PDP, skip jump-to-grid — the product grid restores place. */
  useEffect(() => {
    const saved = readShopScroll();
    const currentPath = currentShopPath();
    if (!saved || saved.path !== currentPath) return;
    skipScrollToGridRef.current = true;
  }, [pathname]);

  /** Jump to top of product grid when browse filters change. */
  useEffect(() => {
    if (skipScrollToGridRef.current) {
      skipScrollToGridRef.current = false;
      return;
    }
    scrollProductsToTop(productsAnchorRef.current);
  }, [categorySlug, searchQ, tag, minPrice, maxPrice]);

  return (
    <ShopCategoriesProvider categories={categories}>
      <ShopProductsMetaProvider>
        <div className="page-shell pb-16 pt-0 md:pb-8">
          <h1 className="sr-only">{activeCategoryName ?? "Shop"}</h1>

          <div className="sv-listing-hero-fade flex flex-col md:opacity-100 md:[animation:none] lg:flex-row lg:items-start lg:gap-10 lg:py-6">
            <div className="hidden lg:sticky lg:top-[calc(var(--storefront-header-live-offset)+0.75rem)] lg:block lg:w-72 lg:flex-shrink-0 lg:self-start">
              <ShopCategoryFilterSidebar
                categories={categories}
                selectedSlug={categorySlug}
                onSelect={handleSelectCategory}
              />
            </div>

            <div className="min-w-0 flex-1 overflow-x-hidden">
              <ShopProductToolbar
                categories={categories}
                categorySlug={categorySlug}
                searchQ={searchQ}
                tag={tag}
                minPrice={minPrice}
                maxPrice={maxPrice}
                isPending={isPending}
                onSelectCategory={handleSelectCategory}
                onSearch={handleSearch}
                onTagChange={handleTagChange}
                onPriceChange={handlePriceChange}
                onClearCategory={clearCategory}
                onClearSearch={clearSearch}
                onClearTag={clearTag}
                onClearPrice={clearPrice}
              />

              <div
                ref={productsAnchorRef}
                className={`relative z-0 pt-3 lg:pt-4 ${
                  isPending ? "pointer-events-none opacity-50 transition-opacity duration-150" : ""
                }`}
                aria-busy={isPending}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </ShopProductsMetaProvider>
    </ShopCategoriesProvider>
  );
}
