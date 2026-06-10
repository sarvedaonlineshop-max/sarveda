"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";

import { SearchCategoryBrowse } from "@/components/search/SearchCategoryBrowse";
import { SearchSuggestionRow } from "@/components/search/SearchSuggestionRow";
import { fetchSiteSearchSuggestions, type SiteSearchSuggestion } from "@/lib/api";

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(q);
  const [items, setItems] = useState<SiteSearchSuggestion[]>([]);
  const [suggestions, setSuggestions] = useState<SiteSearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchSiteSearchSuggestions(trimmed, 32);
      setItems(list);
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
      void fetchSiteSearchSuggestions(query.trim(), 8)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
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
      <p className="mt-2 max-w-2xl text-sm text-stone-600">
        Find products, courses, events, and insights across Sarveda.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products, courses, events, insights…"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-base shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        />
      </form>

      {suggestions.length > 0 && !q && query.trim().length >= 2 ? (
        <ul className="mt-3 max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {suggestions.map((s) => (
            <li key={`${s.type}-${s.slug}`} className="border-b border-stone-100 last:border-b-0">
              <SearchSuggestionRow item={s} className="px-4 py-3" />
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
            <p className="mt-4 text-stone-600">No results found for &ldquo;{q}&rdquo;.</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="mt-4 max-w-3xl divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
              {items.map((item) => (
                <li key={`${item.type}-${item.slug}`}>
                  <SearchSuggestionRow item={item} className="px-4 py-3.5" />
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
