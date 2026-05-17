"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import type { OrdersListData } from "@/lib/admin-api";
import { downloadAdminOrdersPdf, fetchAdminOrders } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const buckets = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending (48h)" },
  { value: "abandoned", label: "Abandoned unpaid" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
  { value: "paid", label: "Paid / processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" }
] as const;

export default function AdminOrdersPage() {
  const [bucket, setBucket] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrdersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminOrders({
        bucket: bucket === "all" ? undefined : bucket,
        page,
        limit: 20
      });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load orders");
      setData(null);
    }
  }, [bucket, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportPdf = async (range: "today" | "week" | "month" | "year") => {
    setPdfErr(null);
    setPdfLoading(range);
    try {
      await downloadAdminOrdersPdf(range);
    } catch (e) {
      setPdfErr(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">Orders</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Abandoned unpaid means pending payment for more than 48 hours (still not cancelled). Cancelled and refunded
          are separate buckets.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/60">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Export PDF
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["today", "Today"],
              ["week", "Last 7 days"],
              ["month", "This month"],
              ["year", "This year (by month)"]
            ] as const
          ).map(([range, label]) => (
            <button
              key={range}
              type="button"
              disabled={pdfLoading !== null}
              onClick={() => void exportPdf(range)}
              className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-amber-500 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-amber-500"
            >
              {pdfLoading === range ? "Preparing…" : label}
            </button>
          ))}
        </div>
        {pdfErr ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
            {pdfErr}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => {
              setPage(1);
              setBucket(b.value);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              bucket === b.value
                ? "bg-stone-900 text-amber-400"
                : "border border-stone-300 bg-white text-stone-600 hover:border-amber-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-amber-500"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      {!data ? (
        <p className="text-stone-500 dark:text-stone-400">Loading…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-100 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/80">
                <tr>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Order</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Customer</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Items</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Amount</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Status</th>
                  <th className="px-4 py-3 font-semibold text-stone-600 dark:text-stone-300">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-700">
                {data.items.map((o) => (
                  <tr key={o.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-mono font-medium text-amber-700 hover:underline dark:text-amber-400"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-stone-800 dark:text-stone-100">{o.email}</div>
                      {o.customerName ? (
                        <div className="text-xs text-stone-500 dark:text-stone-400">{o.customerName}</div>
                      ) : null}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-stone-600 dark:text-stone-300">
                      <span className="text-xs">{o.itemCount} units</span>
                      {o.linePreview.length ? (
                        <div className="truncate text-xs text-stone-500 dark:text-stone-400">{o.linePreview.join(" · ")}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {formatMinorFromPaise(o.grandTotalInPaise, o.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                        {o.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap dark:text-stone-400">
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

          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="orders"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      )}
    </div>
  );
}
