"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initial);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/shop?search=${encodeURIComponent(trimmed)}` : "/shop");
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-xl px-4 pt-6 md:px-0 md:pt-0">
      <label htmlFor="mobile-search" className="sr-only">
        Search products
      </label>
      <input
        id="mobile-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products, categories, rituals…"
        className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        autoFocus
      />
      <p className="mt-3 text-sm text-stone-500">
        Full suggestions and results are coming soon. For now, search opens the shop catalog.
      </p>
    </form>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-[60vh] bg-stone-50 px-0 py-6 md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl md:rounded-3xl md:border md:border-stone-200 md:bg-white md:p-10">
        <h1 className="px-4 font-serif text-2xl font-semibold text-stone-900 md:px-0">Search</h1>
        <Suspense fallback={<p className="px-4 pt-6 text-stone-500 md:px-0">Loading search…</p>}>
          <SearchForm />
        </Suspense>
      </div>
    </div>
  );
}
