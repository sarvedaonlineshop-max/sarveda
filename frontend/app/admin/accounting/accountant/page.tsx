"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  fetchAccountingAccounts,
  fetchAccountingJournals,
  formatInrPaise,
  type AccountingJournalEntry
} from "@/lib/accounting-api";
import {
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  AccountantPageShell,
  AccountantSkeleton,
  AccTableWrap,
  accTd,
  accTh,
  humanizeJournalDescription,
  humanizeJournalStatus,
  journalStatusTone,
  moneyClass,
  reportsTabHref
} from "@/components/admin/accounting/accountant/accountant-ui";

export default function AccountantOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [journalTotal, setJournalTotal] = useState<number | null>(null);
  const [accountTypeCount, setAccountTypeCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<AccountingJournalEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accounts, journals] = await Promise.all([
        fetchAccountingAccounts(),
        fetchAccountingJournals(8, 0)
      ]);
      setAccountCount(accounts.accounts.length);
      setJournalTotal(journals.total);
      setRecent(journals.items);
      setAccountTypeCount(new Set(accounts.accounts.map((a) => a.type.toUpperCase())).size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accountant overview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AccountantPageShell
      title="Accountant"
      subtitle="Review the chart of accounts and posted journal entries behind Sarveda's accounting records."
      actions={
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
        >
          Refresh
        </button>
      }
    >
      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}
      {loading ? <AccountantSkeleton /> : null}

      {!loading ? (
        <>
          <p className="text-xs leading-relaxed text-[#8a7060]">
            Journal entries are created by Sarveda&apos;s accounting workflows and are read-only once
            posted.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AccountingMetricCard
              label="Chart of Accounts"
              value={accountCount != null ? String(accountCount) : "—"}
              hint="Ledger accounts"
              href="/admin/accounting/accounts"
            />
            <AccountingMetricCard
              label="Journal Entries"
              value={journalTotal != null ? String(journalTotal) : "—"}
              hint="All recorded entries"
              href="/admin/accounting/journals"
            />
            <AccountingMetricCard
              label="Account Types"
              value={accountTypeCount != null ? String(accountTypeCount) : "—"}
              hint="Distinct account categories"
              href="/admin/accounting/accounts"
            />
          </div>

          <AccountingSectionCard>
            <AccountingSectionHeader title="Ledger Tools" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AccountingQuickAction
                label="Chart of Accounts"
                hint="Browse ledger accounts"
                href="/admin/accounting/accounts"
              />
              <AccountingQuickAction
                label="Journal Entries"
                hint="Inspect posted entries"
                href="/admin/accounting/journals"
              />
              <AccountingQuickAction
                label="Trial Balance"
                hint="Financial Reports"
                href={reportsTabHref("tb")}
              />
              <AccountingQuickAction
                label="General Ledger"
                hint="Financial Reports"
                href={reportsTabHref("gl")}
              />
              <AccountingQuickAction
                label="Profit & Loss"
                hint="Financial Reports"
                href={reportsTabHref("pl")}
              />
              <AccountingQuickAction
                label="Balance Sheet"
                hint="Financial Reports"
                href={reportsTabHref("bs")}
              />
            </div>
          </AccountingSectionCard>

          <AccountingSectionCard>
            <AccountingSectionHeader
              title="Recent Journal Entries"
              action={
                <Link
                  href="/admin/accounting/journals"
                  className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                >
                  View all journal entries →
                </Link>
              }
            />
            {recent.length === 0 ? (
              <AccountingEmptyState title="No recent journal entries." />
            ) : (
              <AccTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={accTh()}>Date</th>
                      <th className={accTh()}>Journal #</th>
                      <th className={accTh()}>Description</th>
                      <th className={accTh(true)}>Debit</th>
                      <th className={accTh(true)}>Credit</th>
                      <th className={accTh()}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((j) => (
                      <tr
                        key={j.id}
                        className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                      >
                        <td className={accTd()}>{j.entryDate.slice(0, 10)}</td>
                        <td className={`${accTd()} font-mono text-[12px]`}>{j.entryNumber}</td>
                        <td className={accTd()}>{humanizeJournalDescription(j.memo)}</td>
                        <td className={`${accTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(j.totalDebitInPaise)}
                        </td>
                        <td className={`${accTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(j.totalCreditInPaise)}
                        </td>
                        <td className={accTd()}>
                          <AccountingStatusBadge tone={journalStatusTone(j.status)}>
                            {humanizeJournalStatus(j.status)}
                          </AccountingStatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccTableWrap>
            )}
          </AccountingSectionCard>
        </>
      ) : null}
    </AccountantPageShell>
  );
}
