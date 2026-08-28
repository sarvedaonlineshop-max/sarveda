"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  createBankTransfer, fetchBankingDashboard, formatInrPaise, listBankTransfers,
  postBankTransfer, previewBankTransfer, type BankAccountRow
} from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingSectionCard, AccountingSectionHeader,
  BankingPageShell, BankingTableWrap, FeatureUnavailable, accountingButtonClass,
  accountingInputClass, bankingTd, bankingTh, fieldLabelClass, formatBankDate,
  moneyClass, transferKindLabel
} from "@/components/admin/accounting/banking/banking-ui";

type Kind = "INTERNAL_TRANSFER" | "CASH_DEPOSIT" | "CASH_WITHDRAWAL";

export default function BankTransfersPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [transfers, setTransfers] = useState<Array<Record<string, unknown>>>([]);
  const [enabled, setEnabled] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ transferKind: "INTERNAL_TRANSFER" as Kind, transferDate: new Date().toISOString().slice(0, 10), amount: "", source: "", destination: "", reference: "", memo: "" });

  const refresh = useCallback(async () => {
    const [dash, data] = await Promise.all([fetchBankingDashboard(), listBankTransfers(100)]);
    setAccounts(dash.accounts.filter((a) => a.isActive)); setEnabled(dash.bankingEnabled); setTransfers(data.transfers);
  }, []);
  useEffect(() => { void refresh().catch((e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Transfers could not be loaded." })); }, [refresh]);

  const banks = useMemo(() => accounts.filter((a) => a.accountType === "BANK"), [accounts]);
  const cash = useMemo(() => accounts.filter((a) => a.accountType !== "BANK"), [accounts]);
  const sources = form.transferKind === "CASH_DEPOSIT" ? cash : banks;
  const destinations = form.transferKind === "CASH_WITHDRAWAL" ? cash : banks;
  const amount = Math.round(Number(form.amount) * 100);
  const proposal = (preview?.proposal ?? preview) as Record<string, unknown> | null;
  const lines = Array.isArray(proposal?.lines)
    ? (proposal.lines as Array<Record<string, unknown>>)
    : [];

  async function continuePreview() {
    setBusy(true); setNotice(null);
    try {
      const draft = await createBankTransfer({ transferDate: form.transferDate, amountInPaise: amount, transferKind: form.transferKind, sourceBankAccountId: form.source, destinationBankAccountId: form.destination, reference: form.reference || null, memo: form.memo || null });
      const id = String(draft.id); setDraftId(id); setPreview(await previewBankTransfer(id));
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "Transfer review could not be prepared."
      });
    }
    finally { setBusy(false); }
  }
  async function post() {
    setBusy(true);
    try {
      const result = await postBankTransfer(draftId);
      setNotice({
        tone: "success",
        text: `Transfer recorded · ${result.journal.entryNumber}.`
      });
      setDraftId(""); setPreview(null); setConfirm(false); setShowForm(false); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Transfer could not be recorded." }); }
    finally { setBusy(false); }
  }

  return (
    <BankingPageShell
      title="Transfers"
      subtitle="Move money between bank and cash accounts. Review the transfer before recording it."
      actions={
        <button className={accountingButtonClass()} onClick={() => setShowForm((v) => !v)}>
          New Transfer
        </button>
      }
    >
      {!enabled ? (
        <FeatureUnavailable>
          Banking recording is currently unavailable. Transfer history remains available to review.
        </FeatureUnavailable>
      ) : null}
      {notice ? <AccountingAlert tone={notice.tone}>{notice.text}</AccountingAlert> : null}
      {showForm ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="New Transfer"
            description="Choose one of the supported money movements."
          />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><label className={fieldLabelClass()}>Transfer type<select className={accountingInputClass()} value={form.transferKind} onChange={(e) => setForm({ ...form, transferKind: e.target.value as Kind, source: "", destination: "" })}><option value="INTERNAL_TRANSFER">Bank to Bank</option><option value="CASH_DEPOSIT">Cash Deposit</option><option value="CASH_WITHDRAWAL">Cash Withdrawal</option></select></label><label className={fieldLabelClass()}>Date<input type="date" className={accountingInputClass()} value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} /></label><label className={fieldLabelClass()}>Amount (₹)<input inputMode="decimal" className={accountingInputClass()} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label className={fieldLabelClass()}>From<select className={accountingInputClass()} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="">Select source</option>{sources.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className={fieldLabelClass()}>To<select className={accountingInputClass()} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })}><option value="">Select destination</option>{destinations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className={fieldLabelClass()}>Reference / UTR<input className={accountingInputClass()} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label></div>
        {!preview ? (
          <button
            className={`mt-4 ${accountingButtonClass()}`}
            disabled={
              busy ||
              !enabled ||
              !form.source ||
              !form.destination ||
              form.source === form.destination ||
              !Number.isFinite(amount) ||
              amount <= 0
            }
            onClick={() => void continuePreview()}
          >
            Continue to Review
          </button>
        ) : (
          <div className="mt-5 rounded-xl border border-[#e0d8ce] p-4">
            <h3 className="font-semibold text-[#1c352a]">Review transfer</h3>
            <p className="mt-1 text-xs text-[#75675e]">
              {transferKindLabel(form.transferKind)} · {formatBankDate(form.transferDate)} ·{" "}
              {formatInrPaise(amount)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className={bankingTh()}>Account</th>
                    <th className={bankingTh(true)}>Debit</th>
                    <th className={bankingTh(true)}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t border-[#eee8e0]">
                      <td className={bankingTd()}>
                        {String(line.lineMemo ?? line.accountCode ?? "Account")}{" "}
                        <span className="text-xs text-[#75675e]">
                          {String(line.accountCode ?? "")}
                        </span>
                      </td>
                      <td className={`${bankingTd(true)} ${moneyClass()}`}>
                        {Number(line.debitInPaise)
                          ? formatInrPaise(Number(line.debitInPaise))
                          : "—"}
                      </td>
                      <td className={`${bankingTd(true)} ${moneyClass()}`}>
                        {Number(line.creditInPaise)
                          ? formatInrPaise(Number(line.creditInPaise))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className={accountingButtonClass()}
                disabled={!enabled || busy}
                onClick={() => setConfirm(true)}
              >
                Record Transfer
              </button>
              <button
                className={accountingButtonClass("secondary")}
                onClick={() => {
                  setPreview(null);
                  setDraftId("");
                }}
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </AccountingSectionCard>
      ) : null}
      <AccountingSectionCard><AccountingSectionHeader title="Transfer history" />{transfers.length === 0 ? <AccountingEmptyState title="No transfers recorded" description="Create a transfer to move funds between bank and cash accounts." /> : <BankingTableWrap><table className="min-w-full"><thead><tr><th className={bankingTh()}>Date</th><th className={bankingTh()}>Transfer</th><th className={bankingTh()}>Type</th><th className={bankingTh()}>From</th><th className={bankingTh()}>To</th><th className={bankingTh(true)}>Amount</th><th className={bankingTh()}>Status</th></tr></thead><tbody>{transfers.map((t) => <tr key={String(t.id)} className="border-t border-[#eee8e0]"><td className={bankingTd()}>{formatBankDate(String(t.transferDate))}</td><td className={bankingTd()}>{String(t.transferNumber)}</td><td className={bankingTd()}>{transferKindLabel(String(t.transferKind))}</td><td className={bankingTd()}>{String((t.sourceBankAccount as Record<string, unknown> | undefined)?.name ?? "—")}</td><td className={bankingTd()}>{String((t.destinationBankAccount as Record<string, unknown> | undefined)?.name ?? "—")}</td><td className={`${bankingTd(true)} ${moneyClass()}`}>{formatInrPaise(Number(t.amountInPaise))}</td><td className={bankingTd()}>{String(t.status).toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</td></tr>)}</tbody></table></BankingTableWrap>}</AccountingSectionCard>
      <AdminConfirmModal
        open={confirm}
        title="Record this transfer?"
        message="This records the debit and credit shown in the review. Once recorded, the transfer cannot be edited."
        details={[`${transferKindLabel(form.transferKind)} · ${formatInrPaise(amount)}`]}
        confirmLabel="Record Transfer"
        busy={busy}
        onConfirm={() => void post()}
        onClose={() => setConfirm(false)}
      />
    </BankingPageShell>
  );
}
