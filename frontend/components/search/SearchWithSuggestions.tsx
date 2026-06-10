"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { SearchSuggestionRow } from "@/components/search/SearchSuggestionRow";
import { fetchSiteSearchSuggestions, type SiteSearchSuggestion } from "@/lib/api";

type Props = {
  id: string;
  placeholder?: string;
  inputClassName?: string;
  onNavigate?: () => void;
};

export function SearchWithSuggestions({
  id,
  placeholder = "Search Sarveda…",
  inputClassName = "",
  onNavigate
}: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SiteSearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchSiteSearchSuggestions(term)
        .then((items) => {
          setSuggestions(items);
          setOpen(items.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goToSearch(term?: string) {
    const trimmed = (term ?? query).trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
    setOpen(false);
    onNavigate?.();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    goToSearch();
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={onSubmit} role="search">
        <label htmlFor={id} className="sr-only">
          Search Sarveda
        </label>
        <input
          id={id}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className={inputClassName}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-suggestions`}
        />
      </form>

      {open ? (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl"
        >
          {loading ? (
            <li className="px-4 py-3 text-sm text-stone-500">Searching…</li>
          ) : null}
          {suggestions.map((item) => (
            <li key={`${item.type}-${item.slug}`} role="option">
              <SearchSuggestionRow
                item={item}
                onNavigate={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
              />
            </li>
          ))}
          <li className="border-t border-stone-100">
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-amber-800 hover:bg-amber-50"
              onClick={() => goToSearch()}
            >
              See all results for &ldquo;{query.trim()}&rdquo;
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
