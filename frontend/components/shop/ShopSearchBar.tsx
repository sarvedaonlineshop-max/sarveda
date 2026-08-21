"use client";

import { useEffect, useRef, useState } from "react";

import { SearchSuggestionRow } from "@/components/search/SearchSuggestionRow";
import { fetchProductList, type SiteSearchSuggestion } from "@/lib/api";

type Props = {
  value: string;
  onSearch: (term: string) => void;
};

function toSuggestion(item: {
  slug: string;
  name: string;
  primaryImageUrl: string | null;
  fromPriceInPaise: number | null;
}): SiteSearchSuggestion {
  return {
    type: "product",
    slug: item.slug,
    title: item.name,
    imageUrl: item.primaryImageUrl,
    priceInPaise: item.fromPriceInPaise,
    label: "Product"
  };
}

/** Shop-local search: product-only matches, same token rules as the listing. */
export function ShopSearchBar({ value, onSearch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<SiteSearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchProductList({ q: term }, undefined, { limit: 12 })
        .then((list) => {
          const items = list.items.map(toSuggestion);
          setSuggestions(items);
          setOpen(items.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    onSearch(query.trim());
  }

  return (
    <div ref={wrapRef} className="relative z-20 flex min-w-0 flex-1 items-center gap-1.5">
      <form onSubmit={submit} role="search" className="flex min-w-0 flex-1 items-center gap-1.5">
        <label htmlFor="shop-search" className="sr-only">
          Search products
        </label>
        <div className="relative min-w-0 flex-1" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls="shop-search-suggestions">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M16.5 10.5a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <input
            id="shop-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            placeholder="Search"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="shop-search-suggestions"
            className="h-8 min-h-[32px] w-full rounded-full border border-[#E3D9C8] bg-white py-1.5 pl-8 pr-3 text-sm text-brand-ink placeholder:text-brand-muted/70 focus:border-[#166D46] focus:outline-none focus:ring-2 focus:ring-[#166D46]/25"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-8 min-h-[32px] shrink-0 items-center rounded-full bg-[#166D46] px-3 text-[13px] font-semibold text-white shadow-[0_4px_0_rgba(0,0,0,0.16),0_8px_14px_rgba(0,0,0,0.14)] ring-1 ring-black/5 transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#145a3a] hover:shadow-[0_6px_0_rgba(0,0,0,0.14),0_12px_18px_rgba(0,0,0,0.16)] active:translate-y-[2px] active:bg-[#124f33] active:shadow-[0_1px_0_rgba(0,0,0,0.18),0_3px_8px_rgba(0,0,0,0.12)]"
        >
          Search
        </button>
      </form>

      {open ? (
        <ul
          id="shop-search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-brand-cream-dark bg-white py-1 shadow-card-hover"
        >
          {suggestions.map((item) => (
            <li key={`${item.type}-${item.slug}`} role="option" aria-selected={false}>
              <SearchSuggestionRow item={item} onNavigate={() => setOpen(false)} />
            </li>
          ))}
          <li className="border-t border-brand-cream-dark/80">
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-brand-forest transition-colors hover:bg-brand-cream"
              onClick={() => {
                setOpen(false);
                onSearch(query.trim());
              }}
            >
              See all matches for &ldquo;{query.trim()}&rdquo;
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
