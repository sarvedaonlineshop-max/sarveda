"use client";

import { useEffect, useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  fetchAccountingDashboard,
  fetchAccountingStatus,
  type AccountingDashboard,
  type AccountingStatus
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminAccountingDashboardPage() {
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [dashboard, setDashboard] = useState<AccountingDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await fetchAccountingStatus();
        setStatus(s);
        if (s.nativeAccountingEnabled) {
          const d = await fetchAccountingDashboard();
          setDashboard(d);
        }
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load accounting status");
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <AdminAccountingHeader
        title="Accounting Dashboard"
        subtitle="UAT / training ledger — not official company books. Production accounting starts 01-Sep-2026."
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {status && !status.nativeAccountingEnabled ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Backend flag <code className="text-xs">NATIVE_ACCOUNTING_ENABLED</code> is off. Commerce behavior is
          unchanged. Enable on the API server to load CoA and journals here.
        </div>
      ) : null}

      {dashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Chart of Accounts", dashboard.accountCount],
            ["Journal entries", dashboard.journalCount],
            ["Posted journals", dashboard.postedJournalCount],
            ["Failed posting events", dashboard.failedPostingEvents]
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-[#1e3a2f]">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
        Discovery worker:{" "}
        <strong>{status?.discoveryWorkerActive ? "on-demand (Phase 2B)" : "disabled"}</strong>.
        Use ORDER_PAID Shadow page for single-order preview and bounded discovery.
      </div>
    </div>
  );
}
