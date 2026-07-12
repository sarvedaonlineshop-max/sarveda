"use client";

import { useEffect, useRef, useState } from "react";

import { SearchSuggestionRow } from "@/components/search/SearchSuggestionRow";
import { fetchSiteSearchSuggestions, type SiteSearchSuggestion } from "@/lib/api";

type Props = {
  value: string;
  onSearch: (term: string) => void;
};

/** Shop-local search: same suggestion dropdown as the header search, but Enter/Filter
 *  filters the current shop/category listing in place instead of navigating to /search. */
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
      void fetchSiteSearchSuggestions(term)
        .then((items) => {
          setSuggestions(items);
          setOpen(items.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        });
    }, 300);
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
    <div ref={wrapRef} className="relative z-50 flex-1">
      <form onSubmit={submit} role="search" className="flex flex-1 items-center gap-2">
        <label htmlFor="shop-search" className="sr-only">
          Search products
        </label>
        <input
          id="shop-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder="Search products…"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="shop-search-suggestions"
          className="min-h-[40px] flex-1 rounded-full border border-[#E3D9C8] bg-white px-4 text-sm text-brand-ink placeholder:text-brand-muted/70 focus:border-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-forest/20"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-brand-forest px-4 py-2 text-sm font-semibold text-brand-cream transition-colors duration-150 hover:bg-brand-night"
        >
          Filter
        </button>
      </form>

      {open ? (
        <ul
          id="shop-search-suggestions"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[100] max-h-80 overflow-y-auto rounded-xl border border-brand-cream-dark bg-white py-1 shadow-card-hover"
        >
          {suggestions.map((item) => (
            <li key={`${item.type}-${item.slug}`} role="option" aria-selected={false}>
              <SearchSuggestionRow item={item} onNavigate={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
