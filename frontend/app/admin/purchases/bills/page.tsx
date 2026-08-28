"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBills, formatInrPaise, patchBill, type BillRow } from "@/lib/purchases-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingStatusBadge,
  PurchasesFilterBar,
  PurchasesPageShell,
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  billStatusLabel,
  billStatusTone,
  fieldLabelClass,
  fmtPurchasesDate,
  isBillOverdue,
  moneyClass,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

type BillFilter = "ALL" | "OPEN" | "OVERDUE" | "PAID" | "PARTIAL" | "DRAFT";

export default function BillsPage() {
  const [items, setItems] = useState<BillRow[]>([]);
  const [summary, setSummary] = useState({ outstandingInPaise: 0, overdueInPaise: 0 });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<BillFilter>("ALL");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const statusParam =
        filter === "OPEN" || filter === "PAID" || filter === "DRAFT" ? filter : undefined;
      const data = await fetchBills({ q: q.trim() || undefined, status: statusParam });
      setItems(data.items);
      setSummary(data.summary);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load bills");
    }
  }, [q, filter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const visible = useMemo(() => {
    return items.filter((b) => {
      const overdue = isBillOverdue(b.dueDate, b.status);
      const partial = b.status === "OPEN" && b.paidInPaise > 0 && b.paidInPaise < b.totalInPaise;
      if (filter === "OVERDUE") return overdue;
      if (filter === "PARTIAL") return partial;
      return true;
    });
  }, [items, filter]);

  async function markPaid(id: string) {
    setBusyId(id);
    try {
      await patchBill(id, { status: "PAID" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mark paid failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PurchasesPageShell
      title="Vendor Bills"
      subtitle="Record supplier invoices and track amounts payable."
      actions={
        <Link href="/admin/purchases/bills/new" className={accountingButtonClass("primary")}>
          + New Bill
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccountingMetricCard
          label="Outstanding Payables"
          value={formatInrPaise(summary.outstandingInPaise)}
          hint="Open bills balance"
        />
        <AccountingMetricCard
          label="Overdue"
          value={formatInrPaise(summary.overdueInPaise)}
          hint="Past due date"
        />
      </div>

      <PurchasesFilterBar>
        <label className={fieldLabelClass()}>
          Search
          <input
            className={accountingInputClass()}
            placeholder="Bill #, vendor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className={fieldLabelClass()}>
          Status
          <select
            className={accountingInputClass()}
            value={filter}
            onChange={(e) => setFilter(e.target.value as BillFilter)}
          >
            <option value="ALL">All</option>
            <option value="OPEN">Open</option>
            <option value="OVERDUE">Overdue</option>
            <option value="PARTIAL">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="DRAFT">Draft</option>
          </select>
        </label>
      </PurchasesFilterBar>

      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      <AccountingAlert tone="info" title="Ops vs books">
        “Mark paid” updates the operational bill status only. Record Vendor Payments in Accounting to
        settle accounts payable in the books.
      </AccountingAlert>

      {visible.length === 0 ? (
        <AccountingEmptyState
          title="No vendor bills found"
          description="Create a bill to record a supplier invoice."
        />
      ) : (
        <PurchasesTableWrap>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>Bill #</th>
                <th className={purchasesTh()}>Vendor</th>
                <th className={purchasesTh()}>Bill Date</th>
                <th className={purchasesTh()}>Due Date</th>
                <th className={purchasesTh(true)}>Amount</th>
                <th className={purchasesTh(true)}>Balance Due</th>
                <th className={purchasesTh()}>Status</th>
                <th className={purchasesTh(true)}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => {
                const overdue = isBillOverdue(b.dueDate, b.status);
                const balance = Math.max(0, b.totalInPaise - (b.paidInPaise ?? 0));
                return (
                  <tr
                    key={b.id}
                    className={`h-11 border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70 ${
                      overdue ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className={`${purchasesTd()} font-semibold text-[#1c352a]`}>{b.billNumber}</td>
                    <td className={purchasesTd()}>{b.vendor?.name ?? "—"}</td>
                    <td className={purchasesTd()}>{fmtPurchasesDate(b.billDate)}</td>
                    <td className={purchasesTd()}>{fmtPurchasesDate(b.dueDate)}</td>
                    <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                      {formatInrPaise(b.totalInPaise)}
                    </td>
                    <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                      {formatInrPaise(balance)}
                    </td>
                    <td className={purchasesTd()}>
                      <AccountingStatusBadge tone={billStatusTone(b.status, overdue)}>
                        {overdue ? "Overdue" : billStatusLabel(b.status)}
                      </AccountingStatusBadge>
                    </td>
                    <td className={purchasesTd(true)}>
                      {b.status === "OPEN" ? (
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline disabled:opacity-50"
                          onClick={() => void markPaid(b.id)}
                        >
                          {busyId === b.id ? "Updating…" : "Mark paid (ops)"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#8a7060]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PurchasesTableWrap>
      )}
    </PurchasesPageShell>
  );
}
