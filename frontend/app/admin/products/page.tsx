"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import type { AdminProductRow } from "@/lib/admin-api";
import { fetchAdminProducts, putAdminProduct } from "@/lib/admin-api";
import { fetchCategoryTree } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";
import { formatINRFromPaise } from "@/lib/money";

function flattenCategoryOptions(nodes: CategoryNode[], depth = 0): { slug: string; label: string }[] {
  const out: { slug: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ slug: n.slug, label: `${"\u2003".repeat(depth)}${n.name}` });
    if (n.children?.length) {
      out.push(...flattenCategoryOptions(n.children, depth + 1));
    }
  }
  return out;
}

export default function AdminProductsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminProductRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [categories, setCategories] = useState<{ slug: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategoryTree({ cache: "no-store" })
      .then((tree) => setCategories(flattenCategoryOptions(tree)))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchAdminProducts({
        q: q || undefined,
        category: category || undefined,
        status: status || undefined,
        page,
        limit: 24
      });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load products");
      setItems([]);
    }
  }, [q, category, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleStatus(p: AdminProductRow) {
    const next = p.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusyId(p.id);
    try {
      await putAdminProduct(p.id, { status: next });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Products</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Search catalogue, filter by category, toggle draft vs active.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="block text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Search
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setPage(1)}
            placeholder="Name…"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="category" className="block text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[8rem]">
          <label htmlFor="status" className="block text-xs font-semibold uppercase text-stone-500">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          >
            <option value="">Active + Draft</option>
            <option value="ACTIVE">Active only</option>
            <option value="DRAFT">Draft only</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-amber-400 dark:bg-stone-700 dark:text-amber-300"
        >
          Apply
        </button>
      </div>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
            <tr>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Image</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Product</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Category</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Price (from)</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Stock</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Status</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                <td className="px-4 py-2">
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-stone-100 bg-stone-100 dark:border-stone-700 dark:bg-stone-800">
                    {p.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.primaryImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-stone-900 dark:text-stone-100">{p.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{p.slug}</p>
                </td>
                <td className="max-w-[10rem] px-4 py-3 text-xs text-stone-600 dark:text-stone-300">
                  {p.categories.map((c) => c.name).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">{formatINRFromPaise(p.fromPriceInPaise)}</td>
                <td className="px-4 py-3">{p.totalOnHand}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void toggleStatus(p)}
                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-medium hover:border-amber-400 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
                  >
                    {busyId === p.id ? "…" : p.status === "ACTIVE" ? "Set draft" : "Set active"}
                  </button>
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="ml-2 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel="products"
        onPrev={() => setPage((pg) => Math.max(1, pg - 1))}
        onNext={() => setPage((pg) => Math.min(pagination.totalPages, pg + 1))}
      />
    </div>
  );
}
