"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ProductCard } from "@/components/shop/ProductCard";
import type { ProductListItem } from "@/lib/types";

type Props = {
  initialItems: ProductListItem[];
  initialPage: number;
  totalPages: number;
  total: number;
  categorySlug?: string;
  searchQ?: string;
};

async function fetchPage(
  page: number,
  categorySlug?: string,
  searchQ?: string
): Promise<{ items: ProductListItem[]; totalPages: number }> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  // Must match the server-side initial fetch limit in app/shop/page.tsx.
  q.set("limit", "48");
  if (categorySlug) q.set("category", categorySlug);
  if (searchQ) q.set("q", searchQ);
  const res = await fetch(`/api/products?${q.toString()}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Failed to load products");
  return {
    items: json.data.items as ProductListItem[],
    totalPages: json.data.pagination.totalPages as number
  };
}

export function ShopInfiniteProductGrid({
  initialItems,
  initialPage,
  totalPages,
  total,
  categorySlug,
  searchQ
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialPage);
  const [pages, setPages] = useState(totalPages);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setPages(totalPages);
  }, [initialItems, initialPage, totalPages, categorySlug, searchQ]);

  const loadMore = useCallback(async () => {
    if (loading || page >= pages) return;
    setLoading(true);
    try {
      const next = page + 1;
      const data = await fetchPage(next, categorySlug, searchQ);
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
      setPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }, [loading, page, pages, categorySlug, searchQ]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  if (items.length === 0) {
    return (
      <p className="mx-4 rounded-2xl border border-dashed border-brand-cream-dark bg-white p-10 text-center text-brand-muted md:mx-0">
        No products match this filter yet.{" "}
        <Link href="/shop" className="font-medium text-brand-gold underline hover:text-brand-forest">
          Clear filters
        </Link>
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 px-4 text-sm text-brand-muted md:mb-6 md:px-0">
        Showing <span className="font-medium text-brand-ink">{items.length}</span> of{" "}
        <span className="font-medium text-brand-ink">{total}</span> products
        {categorySlug ? (
          <>
            {" "}
            <span className="text-brand-muted/60">·</span> filtered by{" "}
            <span className="font-medium text-brand-ink/80">{categorySlug.replace(/-/g, " ")}</span>
          </>
        ) : null}
      </p>
      <ul className="grid grid-cols-2 gap-3 px-3 md:grid-cols-2 md:gap-6 md:px-0 lg:grid-cols-3 lg:gap-8">
        {items.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} className="flex justify-center py-8">
        {loading ? (
          <p className="text-sm text-brand-muted">Loading more…</p>
        ) : page < pages ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-brand-forest/25 px-6 py-2 text-sm font-semibold text-brand-forest hover:bg-brand-forest/5"
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
