"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchBills, formatInrPaise, patchBill, type BillRow } from "@/lib/purchases-api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN");
  } catch {
    return iso;
  }
}

export default function BillsPage() {
  const [items, setItems] = useState<BillRow[]>([]);
  const [summary, setSummary] = useState({ outstandingInPaise: 0, overdueInPaise: 0 });
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchBills({ q: q.trim() || undefined });
      setItems(data.items);
      setSummary(data.summary);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load bills");
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function markPaid(id: string) {
    try {
      await patchBill(id, { status: "PAID" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mark paid failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500">Outstanding payables</p>
          <p className="font-mono text-lg font-semibold">{formatInrPaise(summary.outstandingInPaise)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
          <p className="text-xs text-stone-500">Overdue</p>
          <p className="font-mono text-lg font-semibold text-red-700">{formatInrPaise(summary.overdueInPaise)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="rounded-md border px-3 py-2 text-sm" placeholder="Search bill#, vendor…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link href="/admin/purchases/bills/new" className="ml-auto rounded-md bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white">
          + New bill
        </Link>
      </div>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      <div className="overflow-hidden rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Bill#</th>
              <th className="px-4 py-2 text-left">Vendor</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Due</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="px-4 py-2">{fmtDate(b.billDate)}</td>
                <td className="px-4 py-2 font-mono font-semibold">{b.billNumber}</td>
                <td className="px-4 py-2">{b.vendor?.name ?? "—"}</td>
                <td className="px-4 py-2">{b.status}</td>
                <td className="px-4 py-2">{fmtDate(b.dueDate)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatInrPaise(b.totalInPaise)}</td>
                <td className="px-4 py-2 text-right">
                  {b.status === "OPEN" ? (
                    <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => void markPaid(b.id)}>
                      Mark paid
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">No bills yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
