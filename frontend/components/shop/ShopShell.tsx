"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { CategoryNode } from "@/lib/types";
import { categorySlugFromPathname } from "@/lib/shop-navigation";

import { ShopCategoriesProvider } from "./ShopCategoriesContext";
import { ShopCategoryFilterSidebar } from "./ShopCategoryFilterSidebar";
import { ShopProductToolbar } from "./ShopProductToolbar";
import { ShopProductsMetaProvider } from "./ShopProductsMetaContext";
import { useShopNavigate } from "./useShopNavigate";

type Props = {
  categories: CategoryNode[];
  children: React.ReactNode;
};

export function ShopShell({ categories, children }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate, isPending } = useShopNavigate();

  const categorySlug = categorySlugFromPathname(pathname);
  const searchQ = searchParams.get("q") ?? "";

  const handleSelectCategory = useCallback(
    (slug: string | undefined) => {
      if (slug === categorySlug) return;
      navigate(slug, searchQ);
    },
    [categorySlug, navigate, searchQ]
  );

  const handleSearch = useCallback(
    (term: string) => {
      if (term.trim() === searchQ.trim()) return;
      navigate(categorySlug, term);
    },
    [categorySlug, navigate, searchQ]
  );

  const clearCategory = useCallback(() => navigate(undefined, searchQ), [navigate, searchQ]);
  const clearSearch = useCallback(() => navigate(categorySlug, ""), [navigate, categorySlug]);

  const activeCategoryName = useMemo(() => {
    if (!categorySlug) return null;
    const walk = (nodes: CategoryNode[]): string | null => {
      for (const node of nodes) {
        if (node.slug === categorySlug) return node.name;
        if (node.children.length) {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(categories) ?? categorySlug;
  }, [categories, categorySlug]);

  return (
    <ShopCategoriesProvider categories={categories}>
      <ShopProductsMetaProvider>
        <main className="mx-auto max-w-7xl pb-16 pt-0 md:px-4 md:pb-0 lg:px-8">
          <h1 className="sr-only">{activeCategoryName ?? "Shop"}</h1>

          <div className="flex flex-col lg:h-[calc(100dvh-140px)] lg:flex-row lg:items-stretch lg:gap-10 lg:py-6">
            <div className="hidden lg:flex lg:h-full lg:w-72 lg:flex-shrink-0 lg:flex-col lg:overflow-hidden">
              <ShopCategoryFilterSidebar
                categories={categories}
                selectedSlug={categorySlug}
                onSelect={handleSelectCategory}
              />
            </div>

            <div className="min-w-0 flex-1 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
              <ShopProductToolbar
                categories={categories}
                categorySlug={categorySlug}
                searchQ={searchQ}
                isPending={isPending}
                onSelectCategory={handleSelectCategory}
                onSearch={handleSearch}
                onClearCategory={clearCategory}
                onClearSearch={clearSearch}
              />
              <div className="relative z-0 lg:flex-1 lg:overflow-y-auto">{children}</div>
            </div>
          </div>
        </main>
      </ShopProductsMetaProvider>
    </ShopCategoriesProvider>
  );
}
