"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBankingDashboard, formatInrPaise } from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingSectionCard, AccountingSectionHeader,
  AccountingStatusBadge, BankingPageShell, BankingTableWrap, accountingButtonClass,
  bankingTd, bankingTh, formatBankDate, gatewayStatusLabel, moneyClass
} from "@/components/admin/accounting/banking/banking-ui";

type Control = {
  provider: string; glCode: string; glName: string; balanceInPaise: number; status: string;
  warnings: string[]; lastSettlementAt: string | null; lastSettlementUtr: string | null;
};

export default function GatewayClearingPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetchBankingDashboard().then((d) => setControls(d.gatewayControls ?? [])).catch((e) => setError(e instanceof Error ? e.message : "Gateway clearing could not be loaded.")); }, []);
  const meaningful = (status: string) => ["CLEAR", "OUTSTANDING", "REVIEW_REQUIRED"].includes(status);
  const tone = (status: string) => status === "CLEAR" ? "success" as const : status === "OUTSTANDING" ? "warning" as const : meaningful(status) ? "error" as const : "neutral" as const;

  return (
    <BankingPageShell title="Gateway Clearing" subtitle="Review payment gateway amounts awaiting settlement into bank accounts." actions={<Link className={accountingButtonClass()} href="/admin/accounting/settlements">View Settlements</Link>}>
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      <AccountingAlert>Payment capture and bank settlement are separate steps. Incomplete provider data is shown as unavailable, not as a zero balance.</AccountingAlert>
      <AccountingSectionCard><AccountingSectionHeader title="Provider controls" description="Balances shown here are accounting clearing balances, not live gateway balances." />
        {controls.length === 0 ? <AccountingEmptyState title="No gateway clearing controls available" /> : <BankingTableWrap><table className="min-w-full"><thead><tr><th className={bankingTh()}>Provider</th><th className={bankingTh()}>Ledger Account</th><th className={bankingTh(true)}>Outstanding</th><th className={bankingTh()}>Status</th><th className={bankingTh()}>Last settlement</th><th className={bankingTh()}>Notes</th></tr></thead><tbody>{controls.map((g) => <tr key={g.provider} className="border-t border-[#eee8e0]"><td className={`${bankingTd()} font-semibold`}>{g.provider}</td><td className={bankingTd()}>{g.glName} <span className="font-mono text-xs text-[#75675e]">{g.glCode}</span></td><td className={`${bankingTd(true)} ${meaningful(g.status) ? moneyClass() : "text-[#9a8d84]"}`}>{meaningful(g.status) ? formatInrPaise(g.balanceInPaise) : "—"}</td><td className={bankingTd()}><AccountingStatusBadge tone={tone(g.status)}>{gatewayStatusLabel(g.status)}</AccountingStatusBadge></td><td className={bankingTd()}>{formatBankDate(g.lastSettlementAt)}{g.lastSettlementUtr ? <span className="block font-mono text-xs">{g.lastSettlementUtr}</span> : null}</td><td className={`${bankingTd()} max-w-sm text-xs text-[#75675e]`}>{g.warnings.length ? g.warnings.join("; ") : "—"}</td></tr>)}</tbody></table></BankingTableWrap>}
      </AccountingSectionCard>
    </BankingPageShell>
  );
}
