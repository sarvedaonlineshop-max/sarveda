"use client";

import { useEffect, useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  fetchAccountingJournals,
  formatInrPaise,
  type AccountingJournalEntry
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminAccountingJournalsPage() {
  const [journals, setJournals] = useState<AccountingJournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchAccountingJournals(50, 0);
        setJournals(data.items);
        setTotal(data.total);
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load journals");
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <AdminAccountingHeader
        title="Journals"
        subtitle={`${total} entries — synthetic/manual only in Phase 1.`}
      />
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Entry #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Memo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 align-top">
                <td className="px-4 py-3 font-mono">{row.entryNumber}</td>
                <td className="px-4 py-3">{row.entryDate.slice(0, 10)}</td>
                <td className="px-4 py-3">{row.memo ?? "—"}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3 text-right">{formatInrPaise(row.totalDebitInPaise)}</td>
                <td className="px-4 py-3 text-right">{formatInrPaise(row.totalCreditInPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
