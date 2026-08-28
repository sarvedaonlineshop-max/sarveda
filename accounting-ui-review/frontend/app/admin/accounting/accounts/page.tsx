"use client";

import { useEffect, useState } from "react";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import {
  fetchAccountingAccounts,
  type AccountingAccountRow
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";

export default function AdminAccountingAccountsPage() {
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchAccountingAccounts();
        setAccounts(data.accounts);
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : "Failed to load accounts");
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <AdminAccountingHeader
        title="Chart of Accounts"
        subtitle="Sarveda / Indian e-commerce CoA seed (Phase 1)."
      />
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">System</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-3 font-mono">{row.code}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.type}</td>
                <td className="px-4 py-3">{row.isSystem ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
