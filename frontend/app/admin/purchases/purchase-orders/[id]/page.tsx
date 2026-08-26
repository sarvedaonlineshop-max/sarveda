"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  fetchPurchaseOrder,
  formatInrPaise,
  patchPurchaseOrder,
  receivePurchaseOrder,
  type PoLine,
  type PurchaseOrderRow
} from "@/lib/purchases-api";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN");
  } catch {
    return iso;
  }
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [po, setPo] = useState<PurchaseOrderRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchPurchaseOrder(id);
      setPo(data.item);
      const init: Record<string, number> = {};
      for (const l of data.item.lines ?? []) {
        init[l.id] = Math.max(0, l.quantity - l.receivedQty);
      }
      setReceiveQty(init);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load PO");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSent() {
    setBusy(true);
    try {
      await patchPurchaseOrder(id, { status: "SENT" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function receiveGoods() {
    if (!po?.lines) return;
    const lines = po.lines
      .filter((l) => (receiveQty[l.id] ?? 0) > 0)
      .map((l) => ({ poLineId: l.id, quantityReceived: receiveQty[l.id] }));
    if (lines.length === 0) {
      setErr("Enter quantities to receive");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await receivePurchaseOrder(id, { lines });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Receive failed");
    } finally {
      setBusy(false);
    }
  }

  if (!po && !err) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!po) return <p className="text-sm text-red-700">{err}</p>;

  const canReceive = po.status === "SENT" || po.status === "PARTIALLY_RECEIVED";

  return (
    <div className="space-y-4">
      <Link href="/admin/purchases/purchase-orders" className="text-sm text-[#1e3a2f] hover:underline">
        ← Purchase orders
      </Link>

      {err ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}

      <div className="rounded-lg border bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-mono text-xl font-bold">{po.poNumber}</h2>
            <p className="text-sm text-stone-600">{po.vendor?.name} · {po.status.replace(/_/g, " ")}</p>
          </div>
          <div className="text-right text-sm">
            <p>Order date: {fmtDate(po.orderDate)}</p>
            <p className="font-mono text-lg font-semibold">{formatInrPaise(po.totalInPaise)}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <p><span className="text-stone-500">Warehouse:</span> {po.pickupLocation?.label ?? "—"}</p>
          <p><span className="text-stone-500">Reference:</span> {po.referenceNumber ?? "—"}</p>
          <p><span className="text-stone-500">Terms:</span> {po.paymentTerms ?? "—"}</p>
        </div>
        {po.notes ? <p className="mt-2 text-sm text-stone-600">{po.notes}</p> : null}
        {po.status === "DRAFT" ? (
          <button type="button" disabled={busy} onClick={() => void markSent()} className="mt-3 rounded-md bg-[#1e3a2f] px-3 py-1.5 text-sm font-semibold text-white">
            Mark as issued
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border bg-white dark:border-stone-700 dark:bg-stone-900">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-stone-50 dark:bg-stone-800">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Ordered</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Line total</th>
              {canReceive ? <th className="px-3 py-2 text-right">Receive now</th> : null}
            </tr>
          </thead>
          <tbody>
            {(po.lines ?? []).map((l: PoLine) => (
              <tr key={l.id} className="border-b">
                <td className="px-3 py-2">{l.itemName}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.sku ?? "—"}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td>
                <td className="px-3 py-2 text-right">{l.receivedQty}</td>
                <td className="px-3 py-2 text-right font-mono">{formatInrPaise(l.rateInPaise)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatInrPaise(l.lineTotalInPaise)}</td>
                {canReceive ? (
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={l.quantity - l.receivedQty}
                      className="w-20 rounded border px-2 py-1 text-right text-sm"
                      value={receiveQty[l.id] ?? 0}
                      onChange={(e) => setReceiveQty((s) => ({ ...s, [l.id]: parseInt(e.target.value, 10) || 0 }))}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canReceive ? (
        <button type="button" disabled={busy} onClick={() => void receiveGoods()} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Receive goods → update inventory
        </button>
      ) : null}
    </div>
  );
}
