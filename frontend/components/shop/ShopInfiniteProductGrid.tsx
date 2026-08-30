"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ProductCard } from "@/components/shop/ProductCard";
import { fetchShopProductsPage } from "@/lib/shop-products-client";
import {
  clearShopScroll,
  currentShopPath,
  readShopScroll,
  setShopLoadedPages
} from "@/lib/shop-scroll-restore";
import type { ProductListItem } from "@/lib/types";

import { useShopProductsMeta } from "./ShopProductsMetaContext";

type Props = {
  initialItems: ProductListItem[];
  initialPage: number;
  totalPages: number;
  total: number;
  categorySlug?: string;
  searchQ?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  /** ShopBrowser renders its own sticky "Showing X of Y" + filter pills instead. */
  hideSummary?: boolean;
};

const PAGE_SIZE = 48;

function restoreScrollSilent(savedY: number, productSlug?: string) {
  const apply = () => {
    if (productSlug) {
      const el = document.querySelector<HTMLElement>(`[data-shop-product="${CSS.escape(productSlug)}"]`);
      if (el) {
        const headerOffset =
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--storefront-header-live-offset"
            )
          ) || 80;
        const top = el.getBoundingClientRect().top + window.scrollY - headerOffset - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        return;
      }
    }
    window.scrollTo({ top: savedY, behavior: "auto" });
  };
  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 50);
  window.setTimeout(apply, 150);
}

export function ShopInfiniteProductGrid({
  initialItems,
  initialPage,
  totalPages,
  total,
  categorySlug,
  searchQ,
  tag,
  minPrice,
  maxPrice,
  hideSummary = false
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const restoreStartedRef = useRef(false);
  const { setProductsMeta } = useShopProductsMeta();

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setPages(totalPages);
    setShopLoadedPages(initialPage);
    restoreStartedRef.current = false;
  }, [initialItems, initialPage, totalPages]);

  useEffect(() => {
    setProductsMeta({ loaded: items.length, total });
  }, [items.length, total, setProductsMeta]);

  useEffect(() => {
    setShopLoadedPages(page);
  }, [page]);

  /** Back from PDP: reload the same pages, then jump to the product with no animation. */
  useEffect(() => {
    if (restoreStartedRef.current) return;
    const saved = readShopScroll();
    if (!saved || saved.path !== currentShopPath()) return;

    restoreStartedRef.current = true;
    const snapshot = saved;
    const targetPages = Math.min(
      Math.max(snapshot.loadedPages ?? 1, 1),
      totalPages || snapshot.loadedPages || 1
    );

    let cancelled = false;

    async function restore() {
      setRestoring(true);
      try {
        let merged = initialItems;
        let lastPage = initialPage;
        let lastTotalPages = totalPages;

        for (let p = initialPage + 1; p <= targetPages; p++) {
          const data = await fetchShopProductsPage({
            page: p,
            limit: PAGE_SIZE,
            categorySlug,
            searchQ,
            tag,
            minPrice,
            maxPrice
          });
          if (cancelled) return;
          merged = [...merged, ...data.items];
          lastPage = p;
          lastTotalPages = data.totalPages;
        }

        if (cancelled) return;
        setItems(merged);
        setPage(lastPage);
        setPages(lastTotalPages);
        setShopLoadedPages(lastPage);

        // Wait a paint so cards exist in the DOM, then scroll silently.
        requestAnimationFrame(() => {
          restoreScrollSilent(snapshot.scrollY, snapshot.productSlug);
          clearShopScroll();
          setRestoring(false);
        });
      } catch {
        if (!cancelled) {
          restoreScrollSilent(snapshot.scrollY, snapshot.productSlug);
          clearShopScroll();
          setRestoring(false);
        }
      }
    }

    if (targetPages <= initialPage) {
      requestAnimationFrame(() => {
        restoreScrollSilent(snapshot.scrollY, snapshot.productSlug);
        clearShopScroll();
      });
      return;
    }

    void restore();
    return () => {
      cancelled = true;
    };
    // Only on mount / when the server page identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems, initialPage, totalPages, categorySlug, searchQ, tag, minPrice, maxPrice]);

  const loadMore = useCallback(async () => {
    if (restoring || loading || page >= pages) return;
    setLoading(true);
    try {
      const next = page + 1;
      const data = await fetchShopProductsPage({
        page: next,
        limit: PAGE_SIZE,
        categorySlug,
        searchQ,
        tag,
        minPrice,
        maxPrice
      });
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
      setPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [restoring, loading, page, pages, categorySlug, searchQ, tag, minPrice, maxPrice]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || restoring) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, restoring]);

  if (items.length === 0) {
    return (
      <p className="mx-4 rounded-2xl border border-dashed border-brand-cream-dark bg-white p-10 text-center text-brand-muted md:mx-0">
        No products match this filter yet.{" "}
        <Link href="/store" className="font-medium text-brand-gold underline hover:text-brand-forest">
          Clear filters
        </Link>
      </p>
    );
  }

  return (
    <>
      {!hideSummary ? (
        <p className="mb-3 px-4 text-sm text-brand-muted md:mb-6 md:px-0">
          Showing <span className="font-medium text-brand-ink">{items.length}</span> of{" "}
          <span className="font-medium text-brand-ink">{total}</span> products
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-2.5 gap-y-3 px-3 sm:grid-cols-3 md:gap-x-4 md:gap-y-4 md:px-0 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((product, index) => (
          <li key={product.id} data-shop-product={product.slug}>
            <ProductCard
              product={product}
              revealOnView={!restoring}
              revealDelayMs={restoring ? 0 : (index % 8) * 45}
            />
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} className="flex justify-center py-8">
        {restoring ? (
          <p className="text-sm text-brand-muted">Restoring your place…</p>
        ) : loading ? (
          <p className="text-sm text-brand-muted">Loading more…</p>
        ) : page < pages ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-brand-forest/25 px-6 py-2 text-sm font-semibold text-brand-forest transition-colors duration-150 hover:bg-brand-forest/5"
          >
            Load more
          </button>
        ) : items.length < total ? null : (
          <p className="text-xs text-brand-muted/70">All products loaded</p>
        )}
      </div>
    </>
  );
}
