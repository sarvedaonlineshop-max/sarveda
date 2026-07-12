"use client";

import { useEffect, useMemo, useState } from "react";

import { SlideDrawer } from "@/components/ui/SlideDrawer";
import type { CategoryNode } from "@/lib/types";
import { defaultOpenBranchSlug, sortShopCategories } from "@/lib/shop-categories";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
};

export function ShopMobileCategoryDrawer({ categories, selectedSlug, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => sortShopCategories(categories), [categories]);
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    defaultOpenBranchSlug(sorted, selectedSlug)
  );

  useEffect(() => {
    const next = defaultOpenBranchSlug(sorted, selectedSlug);
    setOpenSlug((current) => (current === next ? current : next));
  }, [selectedSlug, sorted]);

  function openBranch(slug: string) {
    setOpenSlug(slug);
  }

  const activeCategoryName = useMemo(() => {
    if (!selectedSlug) return null;
    const walk = (nodes: CategoryNode[]): string | null => {
      for (const node of nodes) {
        if (node.slug === selectedSlug) return node.name;
        if (node.children.length) {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(sorted) ?? selectedSlug.replace(/-/g, " ");
  }, [selectedSlug, sorted]);

  return (
    <div className="mb-0 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-none border-y border-brand-cream-dark bg-white px-4 py-3 text-sm font-medium tracking-wide text-brand-ink transition-colors duration-150 hover:bg-brand-cream"
      >
        <svg className="h-5 w-5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeWidth={2} d="M3 4h18M3 12h18M3 20h18" />
        </svg>
        Menu
        {activeCategoryName ? (
          <span className="truncate text-brand-muted">· {activeCategoryName}</span>
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
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className={`mb-3 flex min-h-[48px] w-full items-center rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${
              !selectedSlug
                ? "border-brand-forest bg-brand-forest/10 text-brand-forest"
                : "border-brand-cream-dark bg-white text-brand-ink hover:border-brand-gold/50"
            }`}
          >
            All products
          </button>
          <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-card">
            <CategoryNavTree
              nodes={sorted}
              selectedSlug={selectedSlug}
              depth={0}
              onSelect={onSelect}
              openSlug={openSlug}
              onOpen={openBranch}
            />
          </div>
        </div>
      </SlideDrawer>
    </div>
  );
}
