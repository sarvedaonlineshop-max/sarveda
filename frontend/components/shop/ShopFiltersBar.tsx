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
        className="min-h-[40px] flex-1 rounded-full border border-[#E3D9C8] bg-white px-4 text-sm text-brand-ink placeholder:text-brand-muted/70 focus:border-brand-forest focus:outline-none focus:ring-2 focus:ring-brand-forest/20"
      />
      <button
        type="submit"
        className="rounded-full bg-brand-forest px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
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
          className="text-sm font-medium text-brand-gold underline hover:text-brand-forest"
        >
          Clear
        </button>
      )}
    </form>
  );
}
