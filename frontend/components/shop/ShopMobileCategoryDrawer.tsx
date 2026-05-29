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

const filterChip =
  "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border px-4 py-3 text-[11px] font-normal uppercase tracking-[0.08em] transition-all";

export function ShopMobileCategoryDrawer({ categories, selectedSlug }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${filterChip} border-[rgba(196,176,232,0.22)] bg-brand-ivory text-[rgba(90,72,128,0.7)] hover:border-[rgba(196,176,232,0.4)] hover:bg-[rgba(91,62,155,0.08)] hover:text-brand-violet`}
      >
        <svg
          className="h-5 w-5 text-brand-violet"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeWidth={2} d="M3 4h18M3 12h18M3 20h18" />
        </svg>
        Filters & categories
        {selectedSlug ? (
          <span className="truncate normal-case tracking-normal text-brand-mid">
            · {selectedSlug.replace(/-/g, " ")}
          </span>
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
            className={`${filterChip} mb-3 ${
              !selectedSlug
                ? "border-[#9B82CC] bg-[rgba(91,62,155,0.08)] text-brand-violet"
                : "border-[rgba(196,176,232,0.22)] text-brand-mid hover:border-[rgba(196,176,232,0.4)] hover:bg-[rgba(91,62,155,0.08)] hover:text-brand-violet"
            }`}
          >
            All products
          </Link>
          <div className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-ivory p-4">
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
