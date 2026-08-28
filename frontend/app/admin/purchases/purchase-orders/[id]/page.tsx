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
import {
  AccountingAlert,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  PurchasesPageShell,
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  fmtPurchasesDate,
  moneyClass,
  poStatusLabel,
  poStatusTone,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

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

  if (!po && !err) {
    return <p className="text-sm text-[#8a7060]">Loading purchase order…</p>;
  }
  if (!po) {
    return <AccountingAlert tone="error">{err}</AccountingAlert>;
  }

  const canReceive = po.status === "SENT" || po.status === "PARTIALLY_RECEIVED";

  return (
    <PurchasesPageShell
      title={po.poNumber}
      subtitle={`${po.vendor?.name ?? "Vendor"} · ${fmtPurchasesDate(po.orderDate)}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AccountingStatusBadge tone={poStatusTone(po.status)}>
            {poStatusLabel(po.status)}
          </AccountingStatusBadge>
          <Link href="/admin/purchases/purchase-orders" className={accountingButtonClass("secondary", true)}>
            Back to list
          </Link>
          {po.status === "DRAFT" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void markSent()}
              className={accountingButtonClass("primary", true)}
            >
              {busy ? "Updating…" : "Mark as Issued"}
            </button>
          ) : null}
          <Link href="/admin/purchases/bills/new" className={accountingButtonClass("secondary", true)}>
            New Bill
          </Link>
        </div>
      }
    >
      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <AccountingSectionCard>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Vendor</p>
            <p className="mt-1 font-semibold text-[#1c352a]">{po.vendor?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Order date</p>
            <p className="mt-1 text-sm">{fmtPurchasesDate(po.orderDate)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">
              Expected delivery
            </p>
            <p className="mt-1 text-sm">{fmtPurchasesDate(po.expectedDeliveryDate)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">Total</p>
            <p className={`mt-1 text-xl ${moneyClass()}`}>{formatInrPaise(po.totalInPaise)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 border-t border-[#f0ece6] pt-4 text-sm sm:grid-cols-3">
          <p>
            <span className="text-[#8a7060]">Warehouse: </span>
            {po.pickupLocation?.label ?? "—"}
          </p>
          <p>
            <span className="text-[#8a7060]">Reference: </span>
            {po.referenceNumber ?? "—"}
          </p>
          <p>
            <span className="text-[#8a7060]">Payment terms: </span>
            {po.paymentTerms ?? "—"}
          </p>
        </div>
        {po.notes ? <p className="mt-3 text-sm text-[#4a3f38]">{po.notes}</p> : null}
      </AccountingSectionCard>

      <AccountingSectionCard className="!p-0 overflow-hidden">
        <div className="border-b border-[#e8e2d9] px-4 py-3 sm:px-5">
          <AccountingSectionHeader title="Line items" />
        </div>
        <PurchasesTableWrap>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>Item</th>
                <th className={purchasesTh()}>SKU</th>
                <th className={purchasesTh(true)}>Ordered</th>
                <th className={purchasesTh(true)}>Received</th>
                <th className={purchasesTh(true)}>Rate</th>
                <th className={purchasesTh(true)}>Amount</th>
                {canReceive ? <th className={purchasesTh(true)}>Receive now</th> : null}
              </tr>
            </thead>
            <tbody>
              {(po.lines ?? []).map((l: PoLine) => (
                <tr key={l.id} className="h-11 border-b border-[#f0ece6] last:border-0">
                  <td className={purchasesTd()}>{l.itemName}</td>
                  <td className={`${purchasesTd()} font-mono text-[12px]`}>{l.sku ?? "—"}</td>
                  <td className={purchasesTd(true)}>{l.quantity}</td>
                  <td className={purchasesTd(true)}>{l.receivedQty}</td>
                  <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                    {formatInrPaise(l.rateInPaise)}
                  </td>
                  <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                    {formatInrPaise(l.lineTotalInPaise)}
                  </td>
                  {canReceive ? (
                    <td className={purchasesTd(true)}>
                      <input
                        type="number"
                        min={0}
                        max={l.quantity - l.receivedQty}
                        className={`${accountingInputClass()} ml-auto w-20`}
                        value={receiveQty[l.id] ?? 0}
                        onChange={(e) =>
                          setReceiveQty((s) => ({
                            ...s,
                            [l.id]: parseInt(e.target.value, 10) || 0
                          }))
                        }
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasesTableWrap>
        <div className="flex flex-wrap justify-end gap-6 border-t border-[#e8e2d9] px-4 py-3 text-sm">
          <div className="text-right">
            <p className="text-[#8a7060]">Subtotal</p>
            <p className={moneyClass()}>{formatInrPaise(po.subtotalInPaise)}</p>
          </div>
          {po.discountInPaise ? (
            <div className="text-right">
              <p className="text-[#8a7060]">Discount</p>
              <p className={moneyClass()}>{formatInrPaise(po.discountInPaise)}</p>
            </div>
          ) : null}
          <div className="text-right">
            <p className="text-[#8a7060]">Grand total</p>
            <p className={`text-lg ${moneyClass()}`}>{formatInrPaise(po.totalInPaise)}</p>
          </div>
        </div>
      </AccountingSectionCard>

      {canReceive ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Receive goods"
            description="Update received quantities. Inventory is updated by the existing receive action."
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void receiveGoods()}
            className={accountingButtonClass("success")}
          >
            {busy ? "Receiving…" : "Mark Received Quantities"}
          </button>
        </AccountingSectionCard>
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader title="Related" />
        <p className="text-sm text-[#8a7060]">
          Creating a bill from this PO is not wired in the current API UI. Use{" "}
          <Link href="/admin/purchases/bills/new" className="font-semibold text-[#1c352a] underline">
            New Bill
          </Link>{" "}
          and reference the PO number if needed. Book recognition lives under Accounting → Advanced.
        </p>
      </AccountingSectionCard>
    </PurchasesPageShell>
  );
}
