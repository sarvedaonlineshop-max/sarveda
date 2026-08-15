"use client";

import { SearchWithSuggestions } from "@/components/search/SearchWithSuggestions";

/** Full-width product-page search, shown under breadcrumbs (not in the sticky header). */
export function ProductPageSearchBar() {
  return (
    <div className="relative mt-3">
      <svg
        className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-muted"
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
      <SearchWithSuggestions
        id="pdp-page-search"
        placeholder="Search products…"
        inputClassName="w-full min-h-[44px] rounded-full border border-brand-forest/12 bg-white py-2.5 pl-11 pr-4 text-sm text-brand-ink placeholder:text-brand-muted transition-all focus:border-brand-gold/50 focus:outline-none focus:ring-1 focus:ring-brand-gold/30"
      />
    </div>
  );
}
