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
  q.set("limit", "24");
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
      <p className="mx-4 rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center text-stone-500 md:mx-0">
        No products match this filter yet.{" "}
        <Link href="/shop" className="font-medium text-amber-700 underline hover:text-amber-800">
          Clear filters
        </Link>
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 px-4 text-sm text-stone-500 md:mb-6 md:px-0">
        Showing <span className="font-medium text-stone-800">{items.length}</span> of{" "}
        <span className="font-medium text-stone-800">{total}</span> products
        {categorySlug ? (
          <>
            {" "}
            <span className="text-stone-400">·</span> filtered by{" "}
            <span className="font-medium text-stone-700">{categorySlug.replace(/-/g, " ")}</span>
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
          <p className="text-sm text-stone-500">Loading more…</p>
        ) : page < pages ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-full border border-stone-300 px-6 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Load more
          </button>
        ) : items.length < total ? null : (
          <p className="text-xs text-stone-400">All products loaded</p>
        )}
      </div>
    </>
  );
}
