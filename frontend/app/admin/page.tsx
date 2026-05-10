"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { DashboardData } from "@/lib/admin-api";
import { fetchAdminDashboard } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

function RevenueBars({ rows }: { rows: DashboardData["revenueByDayLast7"] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenueInPaise));
  return (
    <div className="flex h-36 items-end gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {rows.map((r) => {
        const pct = Math.round((r.revenueInPaise / max) * 100);
        return (
          <div key={r.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full max-w-[3rem] rounded-t bg-gradient-to-t from-amber-700 to-amber-400"
              style={{ height: `${Math.max(8, pct)}%`, minHeight: "4px" }}
              title={`${r.date}: ${formatINRFromPaise(r.revenueInPaise)}`}
            />
            <span className="text-[10px] text-stone-500 dark:text-stone-400">{r.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    fetchAdminDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Dashboard failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div>
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-stone-500 dark:text-stone-400" role="status">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Dashboard</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Revenue reflects paid fulfilment-eligible orders.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Total revenue
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">
            {formatINRFromPaise(data.totalRevenueInPaise)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            Orders today
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.today}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            This week
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.thisWeek}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            This month
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-50">{data.ordersCount.thisMonth}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-stone-800 dark:text-stone-100">Products</h2>
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <dl className="grid grid-cols-3 gap-4 text-center">
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Active</dt>
                <dd className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">{data.productsByStatus.active}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Draft</dt>
                <dd className="text-xl font-semibold text-amber-700 dark:text-amber-400">{data.productsByStatus.draft}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-stone-400 dark:text-stone-500">Archived</dt>
                <dd className="text-xl font-semibold text-stone-500 dark:text-stone-400">{data.productsByStatus.archived}</dd>
              </div>
            </dl>
          </div>
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Revenue (last 7 days)</h2>
            </div>
            <RevenueBars rows={data.revenueByDayLast7} />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Low stock</h2>
            <Link
              href="/admin/inventory"
              className="text-sm text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            >
              View all →
            </Link>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <ul className="divide-y divide-stone-100 dark:divide-stone-700">
              {data.lowStockAlerts.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
                  No low-stock SKUs
                </li>
              ) : (
                data.lowStockAlerts.map((a) => (
                  <li key={a.variantId} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{a.productName}</p>
                      <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                        SKU {a.sku} · on hand {a.onHand} (thresh {a.lowStockThreshold})
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/50 dark:text-red-200">
                      Low
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Recent orders</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
          >
            All orders →
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
              <tr>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Order</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Customer</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Amount</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Status</th>
                <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-amber-700 hover:underline dark:text-amber-400"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{o.email}</td>
                  <td className="px-4 py-3">{formatINRFromPaise(o.grandTotalInPaise)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">
                    {new Date(o.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
