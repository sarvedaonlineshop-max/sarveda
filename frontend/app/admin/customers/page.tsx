"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import type { CustomersListData } from "@/lib/admin-api";
import { fetchAdminCustomers } from "@/lib/admin-api";

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminCustomers({ q: search || undefined, page, limit: 20 });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load customers");
      setData(null);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Customers</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Imported from WooCommerce user export. Passwords were not migrated — customers sign in with OTP or Google.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, name, phone"
          className="min-w-[220px] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-amber-600 dark:text-stone-900"
        >
          Search
        </button>
      </form>

      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      {data ? (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {data.pagination.total.toLocaleString("en-IN")} customers
          </p>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
                <tr>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Email</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Name</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Woo ID</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Orders</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-3 text-stone-800 dark:text-stone-100">{u.email}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{u.name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-500">{u.wooCommerceId ?? "—"}</td>
                    <td className="px-4 py-3">{u.orderCount}</td>
                    <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="customers"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      ) : (
        !err && (
          <p className="text-stone-500 dark:text-stone-400" role="status">
            Loading…
          </p>
        )
      )}
    </div>
  );
}
