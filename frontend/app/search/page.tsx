"use client";

import Image from "next/image";
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
      <h1 className="display-text font-serif text-2xl font-semibold text-brand-ink md:text-3xl">Search & browse</h1>
      <form onSubmit={handleSubmit} className="mt-5 max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, category…"
          className="w-full rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white px-4 py-3.5 text-base shadow-sm focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-brand-lavender-mid/30"
        />
      </form>

      {suggestions.length > 0 && !q && query.trim().length >= 2 ? (
        <ul className="mt-3 max-w-xl rounded-xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/product/${s.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-brand-violet-light"
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Image
                    src={s.imageUrl}
                    alt={s.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <span className="h-10 w-10 rounded bg-brand-violet-light" />
                )}
                <span className="flex-1 text-sm font-medium text-brand-ink">{s.name}</span>
                {s.priceInPaise != null ? (
                  <span className="price-text text-sm text-brand-mid">{formatINRFromPaise(s.priceInPaise)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {q ? (
        <section className="mt-8">
          <h2 className="display-text text-sm font-semibold uppercase tracking-widest text-brand-muted">
            Search results
          </h2>
          {loading ? <p className="mt-4 text-brand-muted">Searching…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="mt-4 text-brand-mid">No products found for &ldquo;{q}&rdquo;.</p>
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
    <Suspense fallback={<p className="p-8 text-brand-muted">Loading search…</p>}>
      <SearchResults />
    </Suspense>
  );
}
