"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";

import { SearchCategoryBrowse } from "@/components/search/SearchCategoryBrowse";
import { ProductCard } from "@/components/shop/ProductCard";
import { fetchProductList, fetchProductSuggestions } from "@/lib/api";
import type { ProductListItem } from "@/lib/types";
import { formatINRFromPaise } from "@/lib/money";

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{ slug: string; name: string; imageUrl: string | null; priceInPaise: number | null }>
  >([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchProductList({ q: trimmed, page: "1" }, undefined, { limit: 24 });
      setItems(list.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQuery(q);
    void runSearch(q);
  }, [q, runSearch]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = window.setTimeout(() => {
      void fetchProductSuggestions(query.trim()).then(setSuggestions).catch(() => setSuggestions([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:px-6 md:py-8">
      <h1 className="font-serif text-2xl font-semibold text-stone-900 md:text-3xl">Search & browse</h1>
      <form onSubmit={handleSubmit} className="mt-5 max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, category…"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-base shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        />
      </form>

      {suggestions.length > 0 && !q && query.trim().length >= 2 ? (
        <ul className="mt-3 max-w-xl rounded-xl border border-stone-200 bg-white shadow-sm">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/product/${s.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50"
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <span className="h-10 w-10 rounded bg-stone-100" />
                )}
                <span className="flex-1 text-sm font-medium text-stone-800">{s.name}</span>
                {s.priceInPaise != null ? (
                  <span className="text-sm text-stone-600">{formatINRFromPaise(s.priceInPaise)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {q ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-500">
            Search results
          </h2>
          {loading ? <p className="mt-4 text-stone-500">Searching…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="mt-4 text-stone-600">No products found for &ldquo;{q}&rdquo;.</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
              {items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <SearchCategoryBrowse />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Loading search…</p>}>
      <SearchResults />
    </Suspense>
  );
}
