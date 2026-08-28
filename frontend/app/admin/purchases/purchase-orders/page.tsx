"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchPurchaseOrders, formatInrPaise, type PurchaseOrderRow } from "@/lib/purchases-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingStatusBadge,
  PurchasesDocLink,
  PurchasesFilterBar,
  PurchasesPageShell,
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  fmtPurchasesDate,
  moneyClass,
  poStatusLabel,
  poStatusTone,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

export default function PurchaseOrdersPage() {
  const [items, setItems] = useState<PurchaseOrderRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const data = await fetchPurchaseOrders({ q: q.trim() || undefined, status: status || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <PurchasesPageShell
      title="Purchase Orders"
      subtitle="Create and track purchase commitments to suppliers."
      actions={
        <Link href="/admin/purchases/purchase-orders/new" className={accountingButtonClass("primary")}>
          + New Purchase Order
        </Link>
      }
    >
      <PurchasesFilterBar>
        <label className={fieldLabelClass()}>
          Search
          <input
            className={accountingInputClass()}
            placeholder="PO number, vendor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className={fieldLabelClass()}>
          Status
          <select
            className={accountingInputClass()}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Issued</option>
            <option value="PARTIALLY_RECEIVED">Partially Received</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
      </PurchasesFilterBar>

      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}
      {loading ? <p className="text-sm text-[#8a7060]">Loading purchase orders…</p> : null}

      {!loading && items.length === 0 ? (
        <AccountingEmptyState
          title="No purchase orders yet"
          description="Create a purchase order to commit purchases from a supplier."
        />
      ) : null}

      {items.length > 0 ? (
        <PurchasesTableWrap>
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>PO Number</th>
                <th className={purchasesTh()}>Date</th>
                <th className={purchasesTh()}>Vendor</th>
                <th className={purchasesTh()}>Expected Date</th>
                <th className={purchasesTh(true)}>Amount</th>
                <th className={purchasesTh()}>Status</th>
                <th className={purchasesTh(true)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((po) => (
                <tr key={po.id} className="h-11 border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70">
                  <td className={purchasesTd()}>
                    <PurchasesDocLink href={`/admin/purchases/purchase-orders/${po.id}`}>
                      {po.poNumber}
                    </PurchasesDocLink>
                  </td>
                  <td className={purchasesTd()}>{fmtPurchasesDate(po.orderDate)}</td>
                  <td className={purchasesTd()}>{po.vendor?.name ?? "—"}</td>
                  <td className={purchasesTd()}>{fmtPurchasesDate(po.expectedDeliveryDate)}</td>
                  <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                    {formatInrPaise(po.totalInPaise)}
                  </td>
                  <td className={purchasesTd()}>
                    <AccountingStatusBadge tone={poStatusTone(po.status)}>
                      {poStatusLabel(po.status)}
                    </AccountingStatusBadge>
                  </td>
                  <td className={purchasesTd(true)}>
                    <PurchasesDocLink href={`/admin/purchases/purchase-orders/${po.id}`}>
                      View
                    </PurchasesDocLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasesTableWrap>
      ) : null}
    </PurchasesPageShell>
  );
}
