import Link from "next/link";

import type { CategoryNode } from "@/lib/types";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
};

const filterChipBase =
  "flex min-h-[44px] items-center rounded-full border px-4 py-2 text-[11px] font-normal uppercase tracking-[0.08em] transition-all";

export function ShopCategoryFilterSidebar({ categories, selectedSlug }: Props) {
  return (
    <aside className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-ivory p-5">
      <h2 className="text-[10px] font-normal uppercase tracking-[0.18em] text-brand-violet">
        Categories
      </h2>
      <div className="mt-4">
        <Link
          href="/shop"
          className={`${filterChipBase} mb-2 w-full justify-center ${
            !selectedSlug
              ? "border-[#9B82CC] bg-[rgba(91,62,155,0.08)] text-brand-violet"
              : "border-[rgba(196,176,232,0.22)] bg-transparent text-[rgba(90,72,128,0.7)] hover:border-[rgba(196,176,232,0.4)] hover:bg-[rgba(91,62,155,0.08)] hover:text-brand-violet"
          }`}
        >
          All products
        </Link>
        <CategoryNavTree nodes={categories} selectedSlug={selectedSlug} depth={0} />
      </div>
    </aside>
  );
}
