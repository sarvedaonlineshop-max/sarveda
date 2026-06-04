"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminToast } from "@/components/admin/AdminToast";
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

const thClass =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";

export default function AdminProductsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminProductRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [categories, setCategories] = useState<{ slug: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

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

  async function toggleStatus(p: AdminProductRow, e: React.MouseEvent) {
    e.stopPropagation();
    const next = p.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    setBusyId(p.id);
    try {
      await putAdminProduct(p.id, { status: next });
      setToast({ message: next === "ACTIVE" ? "Product set to active" : "Product set to draft" });
      await load();
    } catch (ex) {
      setToast({ message: ex instanceof Error ? ex.message : "Update failed", error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 font-sans">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Products
          </h1>
          <p className="mt-1 text-sm text-stone-500">Click any row to open and edit the product.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/catalog-gaps"
            className="inline-flex items-center rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Catalog gaps
          </Link>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm hover:bg-amber-400"
          >
            + Add product
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="q" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Search
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setPage(1)}
            placeholder="Product name…"
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="category" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
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
          <label htmlFor="status" className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
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
          className="rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
        >
          Apply
        </button>
      </div>

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50/90 dark:border-stone-700 dark:bg-stone-800/80">
            <tr>
              <th className={thClass}>Image</th>
              <th className={thClass}>Product</th>
              <th className={thClass}>Category</th>
              <th className={thClass}>Sale price (from)</th>
              <th className={thClass}>Stock</th>
              <th className={thClass}>Status</th>
              <th className={`${thClass} text-right`}>Quick action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {items.map((p) => (
              <tr
                key={p.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/admin/products/${p.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/admin/products/${p.id}`);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
              >
                <td className="px-4 py-2.5">
                  <div className="h-12 w-12 overflow-hidden rounded-md border border-stone-200 bg-stone-100 dark:border-stone-600 dark:bg-stone-800">
                    {p.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.primaryImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-stone-900 dark:text-stone-100">{p.name}</p>
                  <p className="font-mono text-xs text-stone-500">{p.slug}</p>
                </td>
                <td className="max-w-[12rem] px-4 py-2.5 text-xs text-stone-600 dark:text-stone-400">
                  {p.categories.map((c) => c.name).join(", ") || "—"}
                </td>
                <td className="px-4 py-2.5 font-medium tabular-nums">
                  {formatINRFromPaise(p.fromPriceInPaise)}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{p.totalOnHand}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={(e) => void toggleStatus(p, e)}
                    className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium shadow-sm hover:border-amber-400 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
                  >
                    {busyId === p.id ? "…" : p.status === "ACTIVE" ? "Set draft" : "Set active"}
                  </button>
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
