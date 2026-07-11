"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";
import { defaultOpenBranchSlug, sortShopCategories } from "@/lib/shop-categories";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
  onSelect?: (slug: string | undefined) => void;
};

export function ShopCategoryFilterSidebar({ categories, selectedSlug, onSelect }: Props) {
  const sorted = useMemo(() => sortShopCategories(categories), [categories]);
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    defaultOpenBranchSlug(sorted, selectedSlug)
  );

  function open(slug: string) {
    setOpenSlug(slug);
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card">
      <div className="flex-shrink-0 border-b border-brand-cream-dark/60 p-5 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Browse</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-brand-ink">Categories</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 pt-3">
        <Link
          href="/shop"
          onClick={(e) => {
            if (onSelect) {
              e.preventDefault();
              onSelect(undefined);
            }
          }}
          className={`mb-2 flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            !selectedSlug
              ? "bg-brand-forest/10 font-semibold text-brand-forest"
              : "text-brand-muted hover:bg-brand-cream hover:text-brand-ink"
          }`}
        >
          All products
        </Link>
        <CategoryNavTree
          nodes={sorted}
          selectedSlug={selectedSlug}
          depth={0}
          onSelect={onSelect}
          openSlug={openSlug}
          onOpen={open}
        />
      </div>
    </aside>
  );
}
