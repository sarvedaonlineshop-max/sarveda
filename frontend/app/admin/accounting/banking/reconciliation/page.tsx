"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  createBankReconciliation, fetchBankingDashboard, fetchBankReconciliation,
  formatInrPaise, listBankReconciliations, recomputeBankReconciliation,
  reconcileBankReconciliation, reopenBankReconciliation, type BankAccountRow
} from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingMetricCard, AccountingSectionCard,
  AccountingSectionHeader, AccountingStatusBadge, BankingPageShell, BankingTableWrap,
  FeatureUnavailable, accountingButtonClass, accountingInputClass, bankingTd, bankingTh,
  fieldLabelClass, formatBankDate, reconStatusLabel
} from "@/components/admin/accounting/banking/banking-ui";

type Modal = "reconcile" | "reopen" | null;

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ periodStart: new Date().toISOString().slice(0, 8) + "01", periodEnd: new Date().toISOString().slice(0, 10), statementClosing: "" });

  const refresh = useCallback(async () => {
    const [dash, r] = await Promise.all([fetchBankingDashboard(), listBankReconciliations(bankAccountId || undefined)]);
    const banks = dash.accounts.filter((a) => a.accountType === "BANK" && a.isActive);
    setAccounts(banks); setEnabled(Boolean(dash.bankReconciliationEnabled)); setRows(r.reconciliations);
    const requested = new URLSearchParams(window.location.search).get("bankAccountId");
    if (!bankAccountId && requested && banks.some((a) => a.id === requested)) setBankAccountId(requested);
  }, [bankAccountId]);
  useEffect(() => { void refresh().catch((e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Reconciliation data could not be loaded." })); }, [refresh]);
  useEffect(() => { if (selectedId) void fetchBankReconciliation(selectedId).then(setDetail).catch(() => setDetail(null)); else setDetail(null); }, [selectedId]);

  const statementLines = useMemo(() => {
    const candidate = detail?.statementLines ?? detail?.lines;
    return Array.isArray(candidate) ? candidate as Array<Record<string, unknown>> : [];
  }, [detail]);
  const unresolved = statementLines.filter((l) => ["UNMATCHED", "POSSIBLE", "DUPLICATE"].includes(String(l.matchStatus))).length;
  const review = statementLines.filter((l) => l.matchStatus === "REVIEW_REQUIRED").length;

  async function create() {
    const closing = form.statementClosing ? Math.round(Number(form.statementClosing) * 100) : null;
    setBusy(true);
    try {
      const result = await createBankReconciliation({ bankAccountId, periodStart: form.periodStart, periodEnd: form.periodEnd, statementClosingBalanceInPaise: closing });
      setSelectedId(String(result.id)); setNotice({ tone: "success", text: "Reconciliation started." }); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Reconciliation could not be started." }); }
    finally { setBusy(false); }
  }
  async function refreshBalances() {
    setBusy(true);
    try { const result = await recomputeBankReconciliation(selectedId); setDetail(result); setNotice({ tone: "success", text: "Balances refreshed." }); await refresh(); }
    catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Balances could not be refreshed." }); }
    finally { setBusy(false); }
  }
  async function runModal() {
    if (!modal) return;
    setBusy(true);
    try {
      const result = modal === "reconcile" ? await reconcileBankReconciliation(selectedId) : await reopenBankReconciliation(selectedId, reason);
      setDetail(result); setNotice({ tone: "success", text: modal === "reconcile" ? "Reconciliation completed and period locked." : "Reconciliation reopened." }); setModal(null); setReason(""); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Action could not be completed." }); }
    finally { setBusy(false); }
  }

  return (
    <BankingPageShell title="Reconciliation" subtitle="Compare book and statement balances, resolve differences, and lock completed periods.">
      {!enabled ? <FeatureUnavailable>Bank reconciliation is currently unavailable. Existing reconciliation history remains unchanged.</FeatureUnavailable> : null}
      {notice ? <AccountingAlert tone={notice.tone}>{notice.text}</AccountingAlert> : null}
      {enabled ? <AccountingSectionCard><AccountingSectionHeader title="Start reconciliation" description="Create a period for one bank account. Reconciliation itself does not create accounting entries." /><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><label className={fieldLabelClass()}>Bank account<select className={accountingInputClass()} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className={fieldLabelClass()}>Period start<input type="date" className={accountingInputClass()} value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></label><label className={fieldLabelClass()}>Period end<input type="date" className={accountingInputClass()} value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></label><label className={fieldLabelClass()}>Statement closing balance (₹)<input inputMode="decimal" className={accountingInputClass()} value={form.statementClosing} onChange={(e) => setForm({ ...form, statementClosing: e.target.value })} /></label></div><button className={`mt-4 ${accountingButtonClass()}`} disabled={busy || !bankAccountId} onClick={() => void create()}>Start Reconciliation</button></AccountingSectionCard> : null}

      <AccountingSectionCard><AccountingSectionHeader title="Reconciliation history" />{rows.length === 0 ? <AccountingEmptyState title="No reconciliation periods" description="Start a reconciliation after importing a bank statement." /> : <BankingTableWrap><table className="min-w-full"><thead><tr><th className={bankingTh()}>Account</th><th className={bankingTh()}>Period</th><th className={bankingTh()}>Status</th><th className={bankingTh(true)}>Difference</th><th className={bankingTh()}>Action</th></tr></thead><tbody>{rows.map((r) => <tr key={String(r.id)} className="border-t border-[#eee8e0]"><td className={bankingTd()}>{String((r.bankAccount as Record<string, unknown> | undefined)?.name ?? accounts.find((a) => a.id === r.bankAccountId)?.name ?? "Bank account")}</td><td className={bankingTd()}>{formatBankDate(String(r.periodStart))} – {formatBankDate(String(r.periodEnd))}</td><td className={bankingTd()}><AccountingStatusBadge tone={r.status === "RECONCILED" ? "success" : "warning"}>{reconStatusLabel(String(r.status))}</AccountingStatusBadge></td><td className={bankingTd(true)}>{formatInrPaise(Number(r.differenceInPaise ?? 0))}</td><td className={bankingTd()}><button className="font-semibold underline" onClick={() => setSelectedId(String(r.id))}>Review</button></td></tr>)}</tbody></table></BankingTableWrap>}</AccountingSectionCard>

      {detail ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Reconciliation detail"
            description={`${formatBankDate(String(detail.periodStart))} – ${formatBankDate(String(detail.periodEnd))} · ${reconStatusLabel(String(detail.status))}`}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <AccountingMetricCard label="Book Balance" value={formatInrPaise(Number(detail.bookClosingBalanceInPaise ?? 0))} />
            <AccountingMetricCard
              label="Statement Balance"
              value={
                detail.statementClosingBalanceInPaise == null
                  ? "—"
                  : formatInrPaise(Number(detail.statementClosingBalanceInPaise))
              }
            />
            <AccountingMetricCard
              label="Difference"
              value={formatInrPaise(Number(detail.differenceInPaise ?? 0))}
              emphasis
            />
            <AccountingMetricCard label="Unmatched" value={String(unresolved)} />
            <AccountingMetricCard label="Needs Review" value={String(review)} />
          </div>
          <div className="mt-4 rounded-lg border border-[#e8e2d9] bg-[#faf5ec]/50 p-4 text-sm">
            {Number(detail.differenceInPaise ?? 0) === 0 && unresolved === 0 && review === 0 ? (
              <>
                <p className="font-semibold text-[#1c352a]">Ready to reconcile</p>
                <ul className="mt-2 space-y-1 text-[#4a3f38]">
                  <li>✓ Difference is {formatInrPaise(0)}</li>
                  <li>✓ No unmatched transactions</li>
                  <li>✓ No transactions need review</li>
                </ul>
              </>
            ) : (
              <>
                <p className="font-semibold text-[#1c352a]">Not ready to reconcile</p>
                <ul className="mt-2 space-y-1 text-[#4a3f38]">
                  {Number(detail.differenceInPaise ?? 0) !== 0 ? (
                    <li>{formatInrPaise(Number(detail.differenceInPaise))} difference remains</li>
                  ) : null}
                  {unresolved > 0 ? <li>{unresolved} transactions are unmatched</li> : null}
                  {review > 0 ? <li>{review} transaction(s) need review</li> : null}
                  {detail.statementClosingBalanceInPaise == null ? (
                    <li>Statement closing balance is required</li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={accountingButtonClass("secondary")}
              disabled={busy || detail.status === "RECONCILED"}
              onClick={() => void refreshBalances()}
            >
              Refresh Balances
            </button>
            {detail.status !== "RECONCILED" ? (
              <button className={accountingButtonClass()} disabled={busy} onClick={() => setModal("reconcile")}>
                Complete Reconciliation
              </button>
            ) : (
              <button className={accountingButtonClass("secondary")} disabled={busy} onClick={() => setModal("reopen")}>
                Reopen Reconciliation
              </button>
            )}
          </div>
        </AccountingSectionCard>
      ) : null}
      {modal === "reopen" ? <div className="fixed bottom-4 left-1/2 z-[101] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-[#e0d8ce] bg-white p-4 shadow-xl"><label className={fieldLabelClass()}>Reason for reopening<textarea className={`${accountingInputClass()} h-20 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></label></div> : null}
      <AdminConfirmModal open={Boolean(modal)} title={modal === "reopen" ? "Reopen reconciliation?" : "Complete reconciliation?"} message={modal === "reopen" ? "Reopening allows statement matches and categories in this period to be changed again. A reason is required." : "This locks the reconciled period and prevents statement matching changes until it is reopened."} details={detail ? [`Difference: ${formatInrPaise(Number(detail.differenceInPaise ?? 0))}`, `Unmatched: ${unresolved}`, `Needs review: ${review}`] : undefined} confirmLabel={modal === "reopen" ? "Reopen" : "Complete Reconciliation"} danger={modal === "reopen"} busy={busy || (modal === "reopen" && reason.trim().length < 3)} onConfirm={() => void runModal()} onClose={() => { setModal(null); setReason(""); }} />
    </BankingPageShell>
  );
}
