"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
};

export function ShopMobileCategoryDrawer({ categories, selectedSlug }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="mb-6 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-stone-100 bg-white px-4 py-3 text-sm font-medium tracking-wide text-stone-900 shadow-sm transition-shadow hover:shadow-md"
      >
        <svg className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeWidth={2} d="M3 4h18M3 12h18M3 20h18" />
        </svg>
        Browse categories
        {selectedSlug ? (
          <span className="truncate text-stone-500">· {selectedSlug.replace(/-/g, " ")}</span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[55] flex flex-col bg-stone-50" role="dialog" aria-modal="true" aria-label="Categories">
          <div className="flex items-center justify-between border-b border-stone-100 bg-white px-4 py-4">
            <span className="font-serif text-lg text-stone-900">Categories</span>
            <button
              type="button"
              className="flex h-11 min-w-[44px] items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"
              onClick={() => setOpen(false)}
              aria-label="Close categories"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
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
        </div>
      ) : null}
    </div>
  );
}
