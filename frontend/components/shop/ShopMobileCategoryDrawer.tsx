"use client";

import { useEffect, useMemo, useState } from "react";

import { SlideDrawer } from "@/components/ui/SlideDrawer";
import type { CategoryNode } from "@/lib/types";
import { defaultOpenBranchSlug, sortShopCategories } from "@/lib/shop-categories";

import { CategoryNavTree } from "./CategoryNavTree";

/** Dispatched from the store header hamburger (mobile). */
export const OPEN_SHOP_MENU_EVENT = "sarveda:open-shop-menu";

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

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SHOP_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SHOP_MENU_EVENT, onOpen);
  }, []);

  function openBranch(slug: string) {
    setOpenSlug(slug);
  }

  function selectAndClose(slug: string | undefined) {
    onSelect(slug);
    setOpen(false);
  }

  return (
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
          onClick={() => selectAndClose(undefined)}
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
            onSelect={selectAndClose}
            onNavigate={() => setOpen(false)}
            openSlug={openSlug}
            onOpen={openBranch}
          />
        </div>
      </div>
    </SlideDrawer>
  );
}
