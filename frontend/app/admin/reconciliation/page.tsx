"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchPaymentsReconciliation } from "@/lib/admin-api";

export default function AdminReconciliationPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPaymentsReconciliation>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchPaymentsReconciliation(days)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Payment reconciliation
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Compare order payment status with gateway payment rows. Use per-order Razorpay sync on mismatches.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span>Last</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1 dark:border-stone-600 dark:bg-stone-900"
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </label>

      {loading ? <p className="text-stone-500">Loading…</p> : null}
      {err ? <p className="text-red-600">{err}</p> : null}

      {data ? (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {data.mismatchCount} mismatch(es) of {data.total} orders in window.
          </p>
          {data.mismatches.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-amber-200/80 text-xs uppercase text-stone-500">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Order status</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.mismatches.map((row) => (
                    <tr key={row.orderId} className="border-b border-amber-100/80">
                      <td className="px-4 py-3 font-mono text-xs">{row.orderNumber}</td>
                      <td className="px-4 py-3">{row.orderStatus}</td>
                      <td className="px-4 py-3">{row.paymentStatus}</td>
                      <td className="px-4 py-3">{row.provider ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${row.orderId}`}
                          className="font-semibold text-amber-800 underline dark:text-amber-400"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900">
              No mismatches in this period.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
