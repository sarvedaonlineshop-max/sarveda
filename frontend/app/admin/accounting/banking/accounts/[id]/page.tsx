"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchBankingDashboard, formatInrPaise, listBankReconciliations,
  listBankStatementLines, listBankTransfers, type BankAccountRow, type BankStatementLineRow
} from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingMetricCard, AccountingSectionCard,
  AccountingSectionHeader, AccountingStatusBadge, BankingPageShell, BankingTableWrap,
  accountDisplayName, bankingTd, bankingTh, formatBankDate, matchStatusLabel,
  matchStatusTone, moneyClass, reconStatusLabel, transferKindLabel
} from "@/components/admin/accounting/banking/banking-ui";

export default function BankAccountDetailPage() {
  const params = useParams<{ id: string }>();
  const [account, setAccount] = useState<BankAccountRow | null>(null);
  const [lines, setLines] = useState<BankStatementLineRow[]>([]);
  const [transfers, setTransfers] = useState<Array<Record<string, unknown>>>([]);
  const [reconciliations, setReconciliations] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([fetchBankingDashboard(), listBankStatementLines({ bankAccountId: params.id, limit: 10 }), listBankTransfers(100), listBankReconciliations(params.id)])
      .then(([dash, l, t, r]) => {
        setAccount(dash.accounts.find((a) => a.id === params.id) ?? null);
        setLines(l.lines);
        setTransfers(t.transfers.filter((x) => String(x.sourceBankAccountId) === params.id || String(x.destinationBankAccountId) === params.id).slice(0, 10));
        setReconciliations(r.reconciliations.slice(0, 10));
      }).catch((e) => setError(e instanceof Error ? e.message : "Account could not be loaded."));
  }, [params.id]);

  if (!account && !error) return <BankingPageShell title="Account" subtitle="Loading account details…"><div /></BankingPageShell>;
  if (!account) return <BankingPageShell title="Account not found"><AccountingAlert tone="error">{error || "This account is unavailable."}</AccountingAlert></BankingPageShell>;

  return (
    <BankingPageShell title={account.name} subtitle="Account book balance, statements, transfers, and reconciliation history." actions={<Link className="text-sm font-semibold text-[#1c352a] underline" href="/admin/accounting/banking/accounts">Back to accounts</Link>}>
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AccountingMetricCard
          label="Book balance"
          value={formatInrPaise(account.bookBalanceInPaise)}
          hint="From accounting records"
        />
        <AccountingMetricCard label="Statement balance" value={account.latestStatementBalanceInPaise == null ? "—" : formatInrPaise(account.latestStatementBalanceInPaise)} hint="Latest imported statement" />
        <AccountingMetricCard label="Difference" value={account.reconciliationDifferenceInPaise == null ? "—" : formatInrPaise(account.reconciliationDifferenceInPaise)} />
        <AccountingMetricCard label="Last reconciliation" value={reconStatusLabel(account.reconciliationStatus)} hint={formatBankDate(account.lastReconciliationAt)} />
        <AccountingMetricCard label="Unmatched" value={String(account.unmatchedCount ?? 0)} href={`/admin/accounting/banking/statements?bankAccountId=${account.id}`} />
      </div>
      <AccountingSectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">{accountDisplayName(account)}<div className="flex gap-2"><Link className="rounded-lg border border-[#e0d8ce] px-3 py-2 text-xs font-semibold" href={`/admin/accounting/banking/statements?bankAccountId=${account.id}`}>Import Statement</Link><Link className="rounded-lg bg-[#1c352a] px-3 py-2 text-xs font-semibold text-white" href={`/admin/accounting/banking/reconciliation?bankAccountId=${account.id}`}>Start Reconciliation</Link></div></div>
      </AccountingSectionCard>
      <AccountingSectionCard><AccountingSectionHeader title="Recent statement lines" />
        {lines.length === 0 ? <AccountingEmptyState title="No statement transactions" /> : <BankingTableWrap><table className="min-w-full"><thead><tr><th className={bankingTh()}>Date</th><th className={bankingTh()}>Description</th><th className={bankingTh(true)}>Money out</th><th className={bankingTh(true)}>Money in</th><th className={bankingTh()}>Status</th></tr></thead><tbody>{lines.map((l) => <tr key={l.id} className="border-t border-[#eee8e0]"><td className={bankingTd()}>{formatBankDate(l.transactionDate)}</td><td className={bankingTd()}>{l.description}</td><td className={`${bankingTd(true)} ${moneyClass()}`}>{l.debitInPaise ? formatInrPaise(l.debitInPaise) : "—"}</td><td className={`${bankingTd(true)} ${moneyClass()}`}>{l.creditInPaise ? formatInrPaise(l.creditInPaise) : "—"}</td><td className={bankingTd()}><AccountingStatusBadge tone={matchStatusTone(l.matchStatus)}>{matchStatusLabel(l.matchStatus)}</AccountingStatusBadge></td></tr>)}</tbody></table></BankingTableWrap>}
      </AccountingSectionCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <AccountingSectionCard><AccountingSectionHeader title="Recent transfers" />{transfers.length === 0 ? <AccountingEmptyState title="No transfers for this account" /> : <ul className="divide-y divide-[#eee8e0]">{transfers.map((t) => <li key={String(t.id)} className="flex justify-between gap-3 py-3 text-sm"><span>{formatBankDate(String(t.transferDate))} · {transferKindLabel(String(t.transferKind))}</span><strong className={moneyClass()}>{formatInrPaise(Number(t.amountInPaise))}</strong></li>)}</ul>}</AccountingSectionCard>
        <AccountingSectionCard><AccountingSectionHeader title="Reconciliation history" />{reconciliations.length === 0 ? <AccountingEmptyState title="No reconciliations for this account" /> : <ul className="divide-y divide-[#eee8e0]">{reconciliations.map((r) => <li key={String(r.id)} className="flex justify-between gap-3 py-3 text-sm"><span>{formatBankDate(String(r.periodStart))} – {formatBankDate(String(r.periodEnd))}</span><AccountingStatusBadge>{reconStatusLabel(String(r.status))}</AccountingStatusBadge></li>)}</ul>}</AccountingSectionCard>
      </div>
    </BankingPageShell>
  );
}
