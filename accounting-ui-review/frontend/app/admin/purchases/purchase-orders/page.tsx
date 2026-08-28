"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPurchaseOrders, formatInrPaise, type PurchaseOrderRow } from "@/lib/purchases-api";

const statusTone: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  SENT: "bg-blue-100 text-blue-800",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700"
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN");
  } catch {
    return iso;
  }
}

export default function PurchaseOrdersPage() {
  const [items, setItems] = useState<PurchaseOrderRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchPurchaseOrders({ q: q.trim() || undefined, status: status || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded-md border px-3 py-2 text-sm"
          placeholder="Search PO#, vendor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Issued</option>
          <option value="PARTIALLY_RECEIVED">Partially received</option>
          <option value="RECEIVED">Received</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Link href="/admin/purchases/purchase-orders/new" className="ml-auto rounded-md bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white">
          + New PO
        </Link>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-2 text-left">PO#</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((po) => (
              <tr key={po.id} className="border-b border-stone-100 hover:bg-stone-50 dark:border-stone-800">
                <td className="px-4 py-2">
                  <Link href={`/admin/purchases/purchase-orders/${po.id}`} className="font-mono font-semibold text-[#1e3a2f] hover:underline">
                    {po.poNumber}
                  </Link>
                </td>
                <td className="px-4 py-2">{fmtDate(po.orderDate)}</td>
                <td className="px-4 py-2">{po.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[po.status] ?? ""}`}>{po.status.replace(/_/g, " ")}</span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{formatInrPaise(po.totalInPaise)}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-stone-500">No purchase orders yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
