"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  ADMIN_CONTENT_LABELS,
  ADMIN_CONTENT_TYPES,
  type AdminContentRow,
  type AdminContentType,
  deleteAdminContent,
  fetchAdminContentList
} from "@/lib/admin-api";

function parseType(raw: string | null): AdminContentType {
  if (raw && (ADMIN_CONTENT_TYPES as readonly string[]).includes(raw)) {
    return raw as AdminContentType;
  }
  return "pages";
}

function AdminContentList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = parseType(searchParams.get("type"));

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminContentRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchAdminContentList(type, { q: q || undefined, page, limit: 24 });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load content");
      setItems([]);
    }
  }, [type, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function setType(next: AdminContentType) {
    setPage(1);
    router.replace(`/admin/content?type=${next}`);
  }

  async function deactivate(row: AdminContentRow) {
    if (!confirm(`Deactivate "${row.title}"?`)) return;
    setBusyId(row.id);
    try {
      await deleteAdminContent(type, row.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Content</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Pages, courses, events, blog, and directory entries.
          </p>
        </div>
        <Link
          href={`/admin/content/${type}/new`}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400"
        >
          + Add {ADMIN_CONTENT_LABELS[type].slice(0, -1).toLowerCase()}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1 dark:border-stone-700">
        {ADMIN_CONTENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              t === type
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
            }`}
          >
            {ADMIN_CONTENT_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="content-q" className="block text-xs font-semibold uppercase text-stone-500">
            Search
          </label>
          <input
            id="content-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setPage(1)}
            placeholder="Title or name…"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (page === 1) void load();
            else setPage(1);
          }}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-amber-400 dark:bg-stone-700"
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
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Title</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Slug</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Status</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Updated</th>
              <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">{row.title}</td>
                <td className="px-4 py-3 text-xs text-stone-500 dark:text-stone-400">{row.slug}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-stone-500">
                  {new Date(row.updatedAt).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={`/admin/content/${type}/${row.id}`}
                    className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void deactivate(row)}
                    className="ml-3 text-xs text-stone-500 hover:text-red-600 disabled:opacity-40"
                  >
                    {busyId === row.id ? "…" : "Deactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-stone-500">
                  No items yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel={ADMIN_CONTENT_LABELS[type].toLowerCase()}
        onPrev={() => setPage((pg) => Math.max(1, pg - 1))}
        onNext={() => setPage((pg) => Math.min(pagination.totalPages, pg + 1))}
      />
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500 dark:text-stone-400">Loading content…</p>}>
      <AdminContentList />
    </Suspense>
  );
}
