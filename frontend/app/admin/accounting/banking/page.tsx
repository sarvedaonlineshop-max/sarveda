"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBankingDashboard, formatInrPaise, listBankTransfers, type BankAccountRow } from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  BankingPageShell,
  BankingTableWrap,
  accountDisplayName,
  accountTypeLabel,
  bankingTd,
  bankingTh,
  formatBankDate,
  moneyClass,
  reconAttentionLabel,
  transferKindLabel
} from "@/components/admin/accounting/banking/banking-ui";

type Gateway = { provider: string; balanceInPaise: number; status: string };

export default function BankingAccountingPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [transfers, setTransfers] = useState<Array<Record<string, unknown>>>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([fetchBankingDashboard(), listBankTransfers(8)])
      .then(([dash, transferData]) => {
        setAccounts(dash.accounts);
        setGateways(dash.gatewayControls ?? []);
        setEnabled(dash.bankingEnabled);
        setTransfers(transferData.transfers);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Banking data could not be loaded."));
  }, []);

  const active = accounts.filter((a) => a.isActive);
  const bookTotal = active.reduce((sum, a) => sum + a.bookBalanceInPaise, 0);
  const unmatched = active.reduce((sum, a) => sum + (a.unmatchedCount ?? 0), 0);
  const attention = active.filter(
    (a) => a.accountType === "BANK" && a.reconciliationStatus !== "RECONCILED"
  ).length;
  const completeGateways = gateways.filter((g) =>
    ["CLEAR", "OUTSTANDING", "REVIEW_REQUIRED"].includes(g.status)
  );
  const incompleteGatewayData = gateways.some(
    (g) => !["CLEAR", "OUTSTANDING", "REVIEW_REQUIRED"].includes(g.status)
  );
  const gatewayTotal = completeGateways.reduce((sum, g) => sum + g.balanceInPaise, 0);
  const needsReview = active.reduce((sum, a) => sum + (a.reviewRequiredCount ?? 0), 0);
  const attentionEmpty = unmatched === 0 && needsReview === 0 && attention === 0;

  return (
    <BankingPageShell
      title="Banking"
      subtitle="Manage bank accounts, statements, transfers and reconciliation."
    >
      {!enabled ? (
        <AccountingAlert tone="warning">
          Banking recording is currently unavailable. Contact an administrator to enable this
          feature. You can still review existing banking information.
        </AccountingAlert>
      ) : null}
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AccountingMetricCard
          label="Bank & Cash"
          value={formatInrPaise(bookTotal)}
          hint="Book balance across active accounts"
          href="/admin/accounting/banking/accounts"
        />
        <AccountingMetricCard
          label="Unmatched"
          value={String(unmatched)}
          hint="Statement transactions to review"
          href="/admin/accounting/banking/statements"
        />
        <AccountingMetricCard
          label="Reconciliation"
          value={String(attention)}
          hint="Accounts needing attention"
          href="/admin/accounting/banking/reconciliation"
        />
        <AccountingMetricCard
          label="Gateway Clearing"
          value={
            incompleteGatewayData && completeGateways.length === 0
              ? "—"
              : formatInrPaise(gatewayTotal)
          }
          hint={
            incompleteGatewayData
              ? "Some provider data is incomplete"
              : "Outstanding clearing balance"
          }
          href="/admin/accounting/banking/gateway"
          unavailable={incompleteGatewayData && completeGateways.length === 0}
        />
      </div>

      <AccountingSectionCard>
        <AccountingSectionHeader title="Needs Attention" />
        {attentionEmpty ? (
          <p className="text-sm text-[#6b5c52]">Everything requiring review is currently cleared.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {unmatched > 0 ? (
              <Link
                className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900"
                href="/admin/accounting/banking/statements"
              >
                {unmatched} unmatched transactions
              </Link>
            ) : null}
            {needsReview > 0 ? (
              <Link
                className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800"
                href="/admin/accounting/banking/statements"
              >
                {needsReview} transactions need review
              </Link>
            ) : null}
            {attention > 0 ? (
              <Link
                className="rounded-lg bg-stone-100 p-3 text-sm font-semibold text-stone-800"
                href="/admin/accounting/banking/reconciliation"
              >
                {attention} accounts need reconciliation
              </Link>
            ) : null}
          </div>
        )}
      </AccountingSectionCard>

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Bank & Cash Accounts"
          action={
            <Link
              className="text-xs font-semibold text-[#1c352a] underline"
              href="/admin/accounting/banking/accounts"
            >
              View all
            </Link>
          }
        />
        {active.length === 0 ? (
          <AccountingEmptyState
            title="No bank or cash accounts yet"
            description="Add an account to begin recording banking activity."
          />
        ) : (
          <BankingTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={bankingTh()}>Account</th>
                  <th className={bankingTh()}>Type</th>
                  <th className={bankingTh(true)}>Book Balance</th>
                  <th className={bankingTh(true)}>Statement Balance</th>
                  <th className={bankingTh(true)}>Difference</th>
                  <th className={bankingTh()}>Reconciliation</th>
                  <th className={bankingTh()}>Attention</th>
                  <th className={bankingTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {active.map((a) => {
                  const attn =
                    (a.unmatchedCount ?? 0) > 0 || (a.reviewRequiredCount ?? 0) > 0
                      ? `${a.unmatchedCount ?? 0} unmatched${
                          (a.reviewRequiredCount ?? 0) > 0
                            ? ` · ${a.reviewRequiredCount} review`
                            : ""
                        }`
                      : "—";
                  return (
                    <tr key={a.id} className="border-t border-[#eee8e0]">
                      <td className={bankingTd()}>{accountDisplayName(a)}</td>
                      <td className={bankingTd()}>
                        <AccountingStatusBadge tone="neutral">
                          {accountTypeLabel(a.accountType)}
                        </AccountingStatusBadge>
                      </td>
                      <td className={`${bankingTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(a.bookBalanceInPaise)}
                      </td>
                      <td className={`${bankingTd(true)} ${moneyClass()}`}>
                        {a.latestStatementBalanceInPaise != null
                          ? formatInrPaise(a.latestStatementBalanceInPaise)
                          : "—"}
                      </td>
                      <td className={`${bankingTd(true)} ${moneyClass()}`}>
                        {a.reconciliationDifferenceInPaise != null
                          ? formatInrPaise(a.reconciliationDifferenceInPaise)
                          : "—"}
                      </td>
                      <td className={bankingTd()}>{reconAttentionLabel(a)}</td>
                      <td className={bankingTd()}>{attn}</td>
                      <td className={bankingTd()}>
                        <Link
                          className="font-semibold text-[#1c352a] underline"
                          href={`/admin/accounting/banking/accounts/${a.id}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </BankingTableWrap>
        )}
      </AccountingSectionCard>

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Recent Transfers"
          action={
            <Link
              className="text-xs font-semibold text-[#1c352a] underline"
              href="/admin/accounting/banking/transfers"
            >
              View all transfers
            </Link>
          }
        />
        {transfers.length === 0 ? (
          <AccountingEmptyState title="No transfers recorded yet." />
        ) : (
          <BankingTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={bankingTh()}>Date</th>
                  <th className={bankingTh()}>From</th>
                  <th className={bankingTh()}>To</th>
                  <th className={bankingTh()}>Reference</th>
                  <th className={bankingTh(true)}>Amount</th>
                  <th className={bankingTh()}>Status</th>
                </tr>
              </thead>
              <tbody>
                {transfers.slice(0, 8).map((t) => (
                  <tr key={String(t.id)} className="border-t border-[#eee8e0]">
                    <td className={bankingTd()}>{formatBankDate(String(t.transferDate))}</td>
                    <td className={bankingTd()}>
                      {String(
                        (t.sourceBankAccount as { name?: string } | undefined)?.name ?? "—"
                      )}
                    </td>
                    <td className={bankingTd()}>
                      {String(
                        (t.destinationBankAccount as { name?: string } | undefined)?.name ?? "—"
                      )}
                    </td>
                    <td className={bankingTd()}>{String(t.reference ?? "—")}</td>
                    <td className={`${bankingTd(true)} ${moneyClass()}`}>
                      {formatInrPaise(Number(t.amountInPaise))}
                    </td>
                    <td className={bankingTd()}>
                      {String(t.status)
                        .toLowerCase()
                        .replace(/^\w/, (c) => c.toUpperCase())}
                      <span className="mt-0.5 block text-[11px] text-[#8a7060]">
                        {transferKindLabel(String(t.transferKind))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BankingTableWrap>
        )}
      </AccountingSectionCard>
    </BankingPageShell>
  );
}
