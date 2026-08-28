"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchGstLedger,
  fetchGstStatus,
  formatInrPaise,
  type GstLedgerReport
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  GstPageShell,
  GstSkeleton,
  GstTableWrap,
  GstUnavailableState,
  MonthFilter,
  currentGstMonth,
  gstAccountLabel,
  gstTd,
  gstTh,
  moneyClass
} from "@/components/admin/accounting/gst/gst-ui";

export default function GstLedgerPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [ledger, setLedger] = useState<GstLedgerReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      if (!st.gstEnabled) {
        setLedger(null);
        return;
      }
      setLedger(await fetchGstLedger({ month }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "GST ledger could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GstPageShell
      title="GST Ledger"
      subtitle="Balances from posted GST journal entries for Output and Input GST accounts."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthFilter month={month} onChange={setMonth} disabled={loading} />
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <GstSkeleton rows={6} /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled && ledger ? (
        <>
          <AccountingAlert tone="info">
            These balances come from posted accounting journals. There is no separate “GST payable”
            control account — estimated net position is a management calculation on Reports.
          </AccountingAlert>

          <AccountingSectionCard>
            <AccountingSectionHeader
              title="GST accounts"
              description={
                ledger.from && ledger.to
                  ? `Period ${String(ledger.from).slice(0, 10)} → ${String(ledger.to).slice(0, 10)}`
                  : undefined
              }
            />
            {ledger.accounts.length === 0 ? (
              <AccountingEmptyState title="No GST ledger activity for this period" />
            ) : (
              <GstTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={gstTh()}>Account</th>
                      <th className={gstTh(true)}>Opening</th>
                      <th className={gstTh(true)}>Debit</th>
                      <th className={gstTh(true)}>Credit</th>
                      <th className={gstTh(true)}>Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.accounts.map((a) => (
                      <tr
                        key={a.accountCode}
                        className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                      >
                        <td className={gstTd()}>
                          <span className="font-semibold text-[#2c2420]">
                            {gstAccountLabel(a.accountCode, a.accountName)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[#8a7060]">
                            {a.accountCode}
                          </span>
                        </td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(a.openingBalanceInPaise)}
                        </td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(a.periodDebitInPaise)}
                        </td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(a.periodCreditInPaise)}
                        </td>
                        <td className={`${gstTd(true)} ${moneyClass()}`}>
                          {formatInrPaise(a.closingBalanceInPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GstTableWrap>
            )}
          </AccountingSectionCard>
        </>
      ) : null}
    </GstPageShell>
  );
}
