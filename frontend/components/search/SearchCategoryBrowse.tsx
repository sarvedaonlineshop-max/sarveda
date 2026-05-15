"use client";

import { useEffect, useMemo, useState } from "react";

import { ProductCard } from "@/components/shop/ProductCard";
import { categoryEmoji } from "@/lib/category-emojis";
import { fetchCategoryTree, fetchProductList } from "@/lib/api";
import type { CategoryNode, ProductListItem } from "@/lib/types";

export function SearchCategoryBrowse() {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [parentSlug, setParentSlug] = useState<string | null>(null);
  const [childSlug, setChildSlug] = useState<string | null>(null);
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    void fetchCategoryTree()
      .then((tree) => {
        setCategories(tree);
        const firstParent = tree[0];
        if (!firstParent) return;
        setParentSlug(firstParent.slug);
        const firstChild = firstParent.children[0];
        setChildSlug(firstChild?.slug ?? firstParent.slug);
      })
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  const parents = categories;
  const activeParent = parents.find((c) => c.slug === parentSlug) ?? parents[0];
  const subcategories = useMemo(() => {
    if (!activeParent) return [];
    if (activeParent.children.length > 0) return activeParent.children;
    return [activeParent];
  }, [activeParent]);

  const activeChildSlug = childSlug ?? subcategories[0]?.slug ?? null;

  useEffect(() => {
    if (!activeChildSlug) {
      setItems([]);
      return;
    }
    setLoadingProducts(true);
    void fetchProductList({ category: activeChildSlug, page: "1" }, undefined, { limit: 24 })
      .then((data) => setItems(data.items))
      .catch(() => setItems([]))
      .finally(() => setLoadingProducts(false));
  }, [activeChildSlug]);

  if (loading) {
    return <p className="mt-8 text-stone-500">Loading categories…</p>;
  }

  if (parents.length === 0) {
    return <p className="mt-8 text-stone-500">Categories are not available right now.</p>;
  }

  return (
    <div className="mt-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-sage">Browse by category</p>

      <div
        className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        role="tablist"
        aria-label="Categories"
      >
        {parents.map((cat) => {
          const active = cat.slug === activeParent?.slug;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setParentSlug(cat.slug);
                const first = cat.children[0];
                setChildSlug(first?.slug ?? cat.slug);
              }}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-forest bg-brand-forest text-white shadow-sm"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
            >
              <span aria-hidden>{categoryEmoji(cat.slug)}</span>
              {cat.name}
            </button>
          );
        })}
      </div>

      {subcategories.length > 1 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {subcategories.map((sub) => {
            const active = sub.slug === activeChildSlug;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setChildSlug(sub.slug)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {sub.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {loadingProducts ? (
        <p className="mt-8 text-stone-500">Loading products…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-stone-500">
          No products in this category yet.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
          {items.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
