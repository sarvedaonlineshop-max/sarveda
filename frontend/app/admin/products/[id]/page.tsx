"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchAdminProduct, putAdminProduct } from "@/lib/admin-api";
import { fetchCategoryTree } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";

function CategoryCheckTree({
  nodes,
  selected,
  onToggle
}: {
  nodes: CategoryNode[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="space-y-1 pl-3 text-sm">
      {nodes.map((n) => (
        <li key={n.id}>
          <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:text-amber-700 dark:text-stone-200 dark:hover:text-amber-400">
            <input
              type="checkbox"
              checked={selected.has(n.id)}
              onChange={() => onToggle(n.id)}
              className="rounded border-stone-400 text-amber-600 focus:ring-amber-500"
            />
            <span>{n.name}</span>
          </label>
          {n.children?.length ? (
            <CategoryCheckTree nodes={n.children} selected={selected} onToggle={onToggle} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function AdminProductEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [seoTitle, setSeoTitle] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchCategoryTree({ cache: "no-store" }).then(setCategoryTree).catch(() => {});
  }, []);

  const loadProduct = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      const p = await fetchAdminProduct(id);
      setName(String(p.name ?? ""));
      setSlug(String(p.slug ?? ""));
      setShortDescription(String(p.shortDescription ?? ""));
      setStatus(String(p.status ?? "DRAFT"));
      setSeoTitle(String((p.seoTitle as string) ?? p.name ?? ""));

      const cats = (
        (p.categories as Array<{ category: { id: string } }>) ?? []
      ).map((x) => x.category.id);
      setSelectedCats(new Set(cats));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load product");
    }
  }, [id]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  function toggleCat(catId: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setErr(null);
    try {
      await putAdminProduct(id, {
        name: name.trim(),
        slug: slug.trim(),
        shortDescription: shortDescription.trim() || null,
        status,
        seoTitle: seoTitle.trim() || null,
        categoryIds: Array.from(selectedCats)
      });
      router.push("/admin/products");
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (err && !name) {
    return (
      <div>
        <p className="text-red-600 dark:text-red-400">{err}</p>
        <Link
          href="/admin/products"
          className="mt-4 inline-block text-amber-700 hover:underline dark:text-amber-400"
        >
          ← Products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link href="/admin/products" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
        ← Products
      </Link>
      <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Edit product</h1>

      <form
        onSubmit={(e) => void handleSave(e)}
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
        <div>
          <label htmlFor="name" className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div>
          <label htmlFor="slug" className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Slug
          </label>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div>
          <label htmlFor="short" className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Short description
          </label>
          <textarea
            id="short"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div>
          <label htmlFor="seo" className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            SEO title
          </label>
          <input
            id="seo"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div>
          <label htmlFor="pst" className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Status
          </label>
          <select
            id="pst"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          >
            <option value="DRAFT">DRAFT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">Categories</p>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-600 dark:bg-stone-950/60">
            <CategoryCheckTree nodes={categoryTree} selected={selectedCats} onToggle={toggleCat} />
          </div>
        </div>

        {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link
            href="/admin/products"
            className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
