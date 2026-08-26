"use client";

import { useEffect, useMemo, useState } from "react";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";
import { defaultOpenBranchSlug, sortShopCategories } from "@/lib/shop-categories";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
};

export function ShopCategoryFilterSidebar({ categories, selectedSlug, onSelect }: Props) {
  const sorted = useMemo(() => sortShopCategories(categories), [categories]);
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    defaultOpenBranchSlug(sorted, selectedSlug)
  );

  useEffect(() => {
    if (!selectedSlug) return;
    const next = defaultOpenBranchSlug(sorted, selectedSlug);
    if (next) setOpenSlug(next);
  }, [selectedSlug, sorted]);

  function toggleBranch(slug: string) {
    setOpenSlug((current) => (current === slug ? null : slug));
  }

  return (
    <aside className="flex flex-col overflow-hidden rounded-2xl border border-brand-cream-dark bg-brand-ivory shadow-card lg:max-h-[calc(100dvh-var(--storefront-header-live-offset)-2rem)]">
      <div className="flex-shrink-0 border-b border-brand-cream-dark/60 p-5 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Browse</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-brand-ink">Categories</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-3 [scrollbar-width:thin]">
        <CategoryNavTree
          nodes={sorted}
          selectedSlug={selectedSlug}
          depth={0}
          expandParentsOnly
          onSelect={onSelect}
          openSlug={openSlug}
          onOpen={toggleBranch}
        />
      </div>
    </aside>
  );
}
