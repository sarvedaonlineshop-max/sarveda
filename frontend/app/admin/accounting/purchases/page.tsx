"use client";

import { useEffect, useState } from "react";
import {
  fetchAccountingStatus,
  fetchPurchaseAccountingDashboard,
  type AccountingStatus,
  type PurchaseAccountingDashboard
} from "@/lib/accounting-api";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import { AdminApiError } from "@/lib/admin-errors";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const AGING_LABELS: Record<string, string> = {
  CURRENT: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  OVER_90: ">90 days",
  PAID: "Paid (native)"
};

export default function PurchaseAccountingPage() {
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [dashboard, setDashboard] = useState<PurchaseAccountingDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAccountingStatus();
        setStatus(s);
        if (s.nativeAccountingEnabled) {
          const d = await fetchPurchaseAccountingDashboard();
          setDashboard(d);
        }
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load purchase accounting");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Purchase Reconciliation"
        subtitle="Review accounts payable, vendor payments, and standalone expenses against ops records."
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {status?.cutover ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
          Cutover:{" "}
          <strong>{status.cutover.cutoverDate ? new Date(status.cutover.cutoverDate).toLocaleDateString() : "Not configured"}</strong>
          {" · "}
          Forward-only posting: <strong>{status.cutover.forwardOnly ? "ON" : "OFF"}</strong>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["AP recognized", formatPaise(dashboard.vendorBills.totalNativeApRecognizedInPaise)],
              ["AP paid", formatPaise(dashboard.vendorBills.totalNativePaidInPaise)],
              ["AP outstanding", formatPaise(dashboard.vendorBills.totalNativeOutstandingInPaise)],
              ["Overdue AP", formatPaise(dashboard.vendorBills.overdueOutstandingInPaise)]
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-2 text-xl font-semibold text-[#1e3a2f]">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1e3a2f]">AP aging (outstanding)</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {Object.entries(dashboard.aging).map(([key, row]) => (
                  <li key={key} className="flex justify-between">
                    <span>{AGING_LABELS[key] ?? key}</span>
                    <span>
                      {row.count} bills · {formatPaise(row.outstandingInPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-[#1e3a2f]">Expenses & data quality</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Posted standalone expenses</span>
                  <span>
                    {dashboard.expenses.postedCount} · {formatPaise(dashboard.expenses.totalPostedStandaloneInPaise)}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Unmapped</span>
                  <span>{dashboard.expenses.unmappedCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>GST data gaps</span>
                  <span>{dashboard.expenses.gstDataGapCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>Duplicate risks</span>
                  <span>{dashboard.expenses.duplicateRiskCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>Ops paid / native unpaid</span>
                  <span>{dashboard.dataQuality.opsPaidNativeUnpaidCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>Ops partial / native unpaid</span>
                  <span>{dashboard.dataQuality.opsPartialNativeUnpaidCount}</span>
                </li>
                <li className="flex justify-between">
                  <span>Ops/native mismatch</span>
                  <span>{dashboard.dataQuality.opsNativePaymentMismatchCount}</span>
                </li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-neutral-600">{dashboard.zohoComparisonNote}</p>
        </>
      ) : null}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Operational “Mark paid” status is evidence only — not the books. Accounts payable is settled through
        vendor payment allocations with bank/cash journals. Pre-cutover bills and expenses belong in opening
        balances.
      </div>
    </div>
  );
}
