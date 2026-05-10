import Link from "next/link";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
};

export function ShopCategoryFilterSidebar({ categories, selectedSlug }: Props) {
  return (
    <aside className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-semibold text-stone-900">Categories</h2>
      <div className="mt-4">
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
        <CategoryNavTree nodes={categories} selectedSlug={selectedSlug} depth={0} />
      </div>
    </aside>
  );
}
