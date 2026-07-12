"use client";

import { createContext, useContext } from "react";

import type { CategoryNode } from "@/lib/types";

const ShopCategoriesContext = createContext<CategoryNode[]>([]);

export function ShopCategoriesProvider({
  categories,
  children
}: {
  categories: CategoryNode[];
  children: React.ReactNode;
}) {
  return (
    <ShopCategoriesContext.Provider value={categories}>{children}</ShopCategoriesContext.Provider>
  );
}

export function useShopCategories(): CategoryNode[] {
  return useContext(ShopCategoriesContext);
}
