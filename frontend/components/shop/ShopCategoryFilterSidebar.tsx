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
    <aside className="sticky top-24 flex max-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm lg:static lg:top-auto lg:max-h-none lg:h-full">
      <div className="flex-shrink-0 border-b border-stone-100 p-5 pb-3">
        <h2 className="font-serif text-lg font-semibold text-stone-900">Categories</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 pt-3">
        <Link
          href="/shop"
          className={`mb-2 flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            !selectedSlug
              ? "bg-amber-50 text-amber-700"
              : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
          }`}
        >
          All products
        </Link>
        <CategoryNavTree nodes={sorted} selectedSlug={selectedSlug} depth={0} />
      </div>
    </aside>
  );
}
