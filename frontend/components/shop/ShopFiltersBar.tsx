"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type Props = {
  categorySlug?: string;
};

export function ShopFiltersBar({ categorySlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? searchParams.get("search") ?? "");

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (categorySlug) params.set("category", categorySlug);
    const term = q.trim();
    if (term) params.set("q", term);
    router.push(`/shop${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form onSubmit={applySearch} className="mb-4 flex flex-wrap items-center gap-2 px-4 md:px-0">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products…"
        className="min-h-[40px] flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand-forest px-4 py-2 text-sm font-semibold text-amber-50 hover:opacity-90"
      >
        Filter
      </button>
      {(q || categorySlug) && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push("/shop");
          }}
          className="text-sm font-medium text-amber-700 underline"
        >
          Clear
        </button>
      )}
    </form>
  );
}
