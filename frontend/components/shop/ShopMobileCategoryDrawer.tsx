"use client";

import Link from "next/link";
import { useState } from "react";

import { SlideDrawer } from "@/components/ui/SlideDrawer";
import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
};

export function ShopMobileCategoryDrawer({ categories, selectedSlug }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-none border-y border-stone-200 bg-white px-4 py-3 text-sm font-medium tracking-wide text-stone-900 transition-colors hover:bg-stone-50"
      >
        <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeWidth={2} d="M3 4h18M3 12h18M3 20h18" />
        </svg>
        Filters & categories
        {selectedSlug ? (
          <span className="truncate text-stone-500">· {selectedSlug.replace(/-/g, " ")}</span>
        ) : null}
      </button>

      <SlideDrawer
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        title="Categories"
        subtitle="Browse by intention"
        ariaLabel="Shop categories"
        panelClassName="max-w-sm"
      >
        <div className="px-4 py-4">
          <Link
            href="/shop"
            onClick={() => setOpen(false)}
            className={`mb-3 flex min-h-[48px] items-center rounded-xl border px-4 py-3 text-sm font-medium ${
              !selectedSlug
                ? "border-amber-700 bg-amber-50 text-amber-700"
                : "border-stone-100 bg-white text-stone-700 hover:border-amber-300"
            }`}
          >
            All products
          </Link>
          <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
            <CategoryNavTree
              nodes={categories}
              selectedSlug={selectedSlug}
              depth={0}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      </SlideDrawer>
    </div>
  );
}
