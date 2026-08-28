"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  FileText,
  Receipt,
  Wallet
} from "lucide-react";
import {
  fetchBills,
  fetchPurchaseOrders,
  formatInrPaise,
  type PurchaseOrderRow
} from "@/lib/purchases-api";
import {
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  PurchasesPageShell
} from "@/components/admin/purchases/purchases-ui";
import { isAccountingEnabled } from "@/lib/accounting-api";

export default function PurchasesOverviewPage() {
  const accountingOn = isAccountingEnabled();
  const [outstanding, setOutstanding] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<number | null>(null);
  const [openPos, setOpenPos] = useState<PurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bills, draft, sent, partial] = await Promise.all([
        fetchBills(),
        fetchPurchaseOrders({ status: "DRAFT" }),
        fetchPurchaseOrders({ status: "SENT" }),
        fetchPurchaseOrders({ status: "PARTIALLY_RECEIVED" })
      ]);
      setOutstanding(bills.summary.outstandingInPaise);
      setOverdue(bills.summary.overdueInPaise);
      setOpenPos([...draft.items, ...sent.items, ...partial.items]);
    } catch {
      /* overview is optional enrichment */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPoCount = useMemo(() => openPos.length, [openPos]);

  return (
    <PurchasesPageShell
      title="Purchases"
      subtitle="Vendor operations — purchase orders, bills, and expenses. Accounting recognition and payables tools live under Accounting."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outstanding != null ? (
          <AccountingMetricCard
            label="Outstanding Payables"
            value={formatInrPaise(outstanding)}
            hint="Open vendor bills"
            href="/admin/purchases/bills"
          />
        ) : (
          <AccountingMetricCard label="Outstanding Payables" unavailable />
        )}
        {overdue != null ? (
          <AccountingMetricCard
            label="Overdue Bills"
            value={formatInrPaise(overdue)}
            hint="Past due date"
            href="/admin/purchases/bills"
          />
        ) : (
          <AccountingMetricCard label="Overdue Bills" unavailable />
        )}
        <AccountingMetricCard
          label="Open Purchase Orders"
          value={loading ? "…" : String(openPoCount)}
          hint="Draft, issued or partially received"
          href="/admin/purchases/purchase-orders"
        />
        <AccountingMetricCard
          label="Purchases this FY"
          unavailable
          hint="Coming soon"
        />
      </div>

      <AccountingSectionCard>
        <AccountingSectionHeader title="Quick Actions" description="Common purchasing workflows" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <AccountingQuickAction
            href="/admin/purchases/purchase-orders/new"
            label="New Purchase Order"
            hint="Create a supplier commitment"
            icon={<ClipboardList size={16} />}
          />
          <AccountingQuickAction
            href="/admin/purchases/bills/new"
            label="New Bill"
            hint="Record a supplier invoice"
            icon={<FileText size={16} />}
          />
          <AccountingQuickAction
            href="/admin/purchases/expenses"
            label="Record Expense"
            hint="Day-to-day expense without a PO"
            icon={<Receipt size={16} />}
          />
          {accountingOn ? (
            <AccountingQuickAction
              href="/admin/accounting/vendor-payments"
              label="Record Vendor Payment"
              hint="Apply payment to open bills"
              icon={<Wallet size={16} />}
            />
          ) : null}
        </div>
      </AccountingSectionCard>

      <AccountingSectionCard>
        <AccountingSectionHeader title="Workflow" />
        <ol className="grid gap-2 text-sm text-[#4a3f38] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["1. Vendors", "/admin/purchases/vendors", "Set up suppliers"],
            ["2. Purchase Orders", "/admin/purchases/purchase-orders", "Commit to buy"],
            ["3. Vendor Bills", "/admin/purchases/bills", "Record invoices / AP"],
            [
              "4. Vendor Payments",
              accountingOn ? "/admin/accounting/vendor-payments" : "/admin/purchases/bills",
              accountingOn ? "Record payment against bills" : "Update bill status; payments in Accounting"
            ]
          ].map(([label, href, hint]) => (
            <li key={label}>
              <Link
                href={href}
                className="block rounded-[10px] border border-[#e8e2d9] px-3 py-2.5 transition hover:border-[#cfc5b8] hover:bg-[#faf5ec]"
              >
                <span className="font-semibold text-[#1c352a]">{label}</span>
                <span className="mt-0.5 block text-xs text-[#8a7060]">{hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      </AccountingSectionCard>
    </PurchasesPageShell>
  );
}
