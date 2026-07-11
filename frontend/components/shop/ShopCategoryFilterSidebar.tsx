import Link from "next/link";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";
import { sortShopCategories } from "@/lib/shop-categories";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
};

export function ShopCategoryFilterSidebar({ categories, selectedSlug }: Props) {
  const sorted = sortShopCategories(categories);

  return (
    <aside className="flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card">
      <div className="flex-shrink-0 border-b border-brand-cream-dark/60 p-5 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Browse</p>
        <h2 className="mt-1 font-serif text-lg font-semibold text-brand-ink">Categories</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 pt-3">
        <Link
          href="/shop"
          className={`mb-2 flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            !selectedSlug
              ? "bg-brand-forest/10 font-semibold text-brand-forest"
              : "text-brand-muted hover:bg-brand-cream hover:text-brand-ink"
          }`}
        >
          All products
        </Link>
        <CategoryNavTree nodes={sorted} selectedSlug={selectedSlug} depth={0} />
      </div>
    </aside>
  );
}
