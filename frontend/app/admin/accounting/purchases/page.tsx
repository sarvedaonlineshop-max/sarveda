"use client";

import { useEffect, useState } from "react";
import {
  fetchAccountingStatus,
  fetchPurchaseAccountingDashboard,
  formatInrPaise,
  type AccountingStatus,
  type PurchaseAccountingDashboard
} from "@/lib/accounting-api";
import {
  AdvancedPageShell,
  AdvancedSection
} from "@/components/admin/accounting/advanced/advanced-ui";
import { AccountingEmptyState } from "@/components/admin/accounting/accounting-ui";
import { AdminApiError } from "@/lib/admin-errors";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return formatInrPaise(p);
}

const AGING_LABELS: Record<string, string> = {
  CURRENT: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  OVER_90: "Over 90 days",
  PAID: "Paid"
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
        setError(err instanceof AdminApiError ? err.message : "Could not load purchase reconciliation");
      }
    })();
  }, []);

  return (
    <AdvancedPageShell
      title="Purchase Reconciliation"
      subtitle="Compare accounts payable and expenses in the books with purchase operations. Diagnostic only — day-to-day vendors, POs, and bills stay under Purchases."
    >
      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {status?.cutover ? (
        <div className="rounded-[12px] border border-[#ebe4db] bg-white px-4 py-3 text-sm text-[#2c2420]">
          Cutover date:{" "}
          <strong>
            {status.cutover.cutoverDate
              ? new Date(status.cutover.cutoverDate).toLocaleDateString("en-IN")
              : "Not configured"}
          </strong>
          {" · "}
          Forward-only posting:{" "}
          <strong>{status.cutover.forwardOnly ? "On" : "Off"}</strong>
        </div>
      ) : null}

      {dashboard ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["AP recognized", formatPaise(dashboard.vendorBills.totalNativeApRecognizedInPaise)],
              ["AP paid", formatPaise(dashboard.vendorBills.totalNativePaidInPaise)],
              ["AP outstanding", formatPaise(dashboard.vendorBills.totalNativeOutstandingInPaise)],
              ["Overdue AP", formatPaise(dashboard.vendorBills.overdueOutstandingInPaise)]
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="rounded-[12px] border border-[#ebe4db] bg-white px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7060]">
                  {label}
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-[#1c352a]">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <AdvancedSection title="AP aging (outstanding)">
              <ul className="space-y-2 text-sm">
                {Object.entries(dashboard.aging).map(([key, row]) => (
                  <li key={key} className="flex justify-between gap-3">
                    <span>{AGING_LABELS[key] ?? key.replace(/_/g, " ")}</span>
                    <span className="tabular-nums text-[#1c352a]">
                      {row.count} bills · {formatPaise(row.outstandingInPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </AdvancedSection>

            <AdvancedSection title="Expenses & data quality">
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between gap-3">
                  <span>Posted standalone expenses</span>
                  <span className="tabular-nums">
                    {dashboard.expenses.postedCount} ·{" "}
                    {formatPaise(dashboard.expenses.totalPostedStandaloneInPaise)}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Unmapped expense categories</span>
                  <span className="tabular-nums">{dashboard.expenses.unmappedCount}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>GST details incomplete</span>
                  <span className="tabular-nums">{dashboard.expenses.gstDataGapCount}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Possible duplicates</span>
                  <span className="tabular-nums">{dashboard.expenses.duplicateRiskCount}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Paid in ops, unpaid in books</span>
                  <span className="tabular-nums">
                    {dashboard.dataQuality.opsPaidNativeUnpaidCount}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Partial paid in ops, unpaid in books</span>
                  <span className="tabular-nums">
                    {dashboard.dataQuality.opsPartialNativeUnpaidCount}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span>Ops vs books payment mismatch</span>
                  <span className="tabular-nums">
                    {dashboard.dataQuality.opsNativePaymentMismatchCount}
                  </span>
                </li>
              </ul>
            </AdvancedSection>
          </div>

          {dashboard.zohoComparisonNote ? (
            <p className="text-xs text-[#8a7060]">{dashboard.zohoComparisonNote}</p>
          ) : null}
        </>
      ) : !error ? (
        <AccountingEmptyState
          title="Purchase reconciliation not loaded"
          description="Native accounting must be enabled to view purchase reconciliation figures."
        />
      ) : null}

      <div className="rounded-[12px] border border-[#e8e2d9] bg-[#faf5ec]/80 px-4 py-3 text-sm text-[#4a3f38]">
        Use Purchases screens for day-to-day bills and expenses. Use Vendor Payments to update
        supplier balances. Pre-cutover amounts belong in Opening Balances.
      </div>
    </AdvancedPageShell>
  );
}
