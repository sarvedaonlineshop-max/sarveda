"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  createBankAccount, deactivateBankAccount, fetchBankingDashboard, formatInrPaise,
  updateBankAccount, type BankAccountRow
} from "@/lib/accounting-api";
import {
  AccountingAlert, AccountingEmptyState, AccountingSectionCard, AccountingSectionHeader,
  AccountingStatusBadge, BankingPageShell, BankingTableWrap, accountDisplayName,
  accountTypeLabel, accountingButtonClass, accountingInputClass, bankingTd, bankingTh,
  fieldLabelClass, moneyClass
} from "@/components/admin/accounting/banking/banking-ui";

type Confirm = { kind: "deactivate" | "settlement"; account: BankAccountRow } | null;

function AccountRowActions({
  account,
  onEdit,
  onSettlement,
  onDeactivate
}: {
  account: BankAccountRow;
  onEdit: () => void;
  onSettlement: () => void;
  onDeactivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!account.isActive) {
    return (
      <Link className="font-semibold underline" href={`/admin/accounting/banking/accounts/${account.id}`}>
        View
      </Link>
    );
  }
  return (
    <div className="relative flex items-center justify-end gap-2">
      <Link className="font-semibold underline" href={`/admin/accounting/banking/accounts/${account.id}`}>
        View
      </Link>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          className="rounded-md border border-[#e0d8ce] px-2 py-1 text-xs font-semibold text-[#4a3f38] hover:bg-[#faf5ec]"
          onClick={() => setOpen((v) => !v)}
        >
          More
        </button>
        {open ? (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 min-w-[14rem] rounded-lg border border-[#e0d8ce] bg-white py-1 shadow-md"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-xs hover:bg-[#faf5ec]"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                Edit details
              </button>
              {!account.razorpaySettlementTarget ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-[#faf5ec]"
                  onClick={() => {
                    setOpen(false);
                    onSettlement();
                  }}
                >
                  Set as Razorpay settlement destination
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                onClick={() => {
                  setOpen(false);
                  onDeactivate();
                }}
              >
                Deactivate
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", bankName: "", glAccountCode: "", accountType: "BANK" as "BANK" | "CASH" | "PETTY_CASH", maskedAccountNumber: "" });

  const refresh = useCallback(async () => {
    const dash = await fetchBankingDashboard();
    setAccounts(dash.accounts);
  }, []);
  useEffect(() => { void refresh().catch((e) => setNotice({ tone: "error", text: e instanceof Error ? e.message : "Accounts could not be loaded." })); }, [refresh]);

  async function saveNew() {
    setBusy(true); setNotice(null);
    try {
      await createBankAccount({ ...form, bankName: form.bankName || null, maskedAccountNumber: form.maskedAccountNumber || null, createGlIfMissing: true });
      setForm({ name: "", bankName: "", glAccountCode: "", accountType: "BANK", maskedAccountNumber: "" });
      setShowForm(false); setNotice({ tone: "success", text: "Account created." }); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Account could not be created." }); } finally { setBusy(false); }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await updateBankAccount(editing.id, { name: editing.name.trim(), bankName: editing.bankName?.trim() || null });
      setEditing(null); setNotice({ tone: "success", text: "Account details updated." }); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Details could not be updated." }); } finally { setBusy(false); }
  }

  async function runConfirmed() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "deactivate") await deactivateBankAccount(confirm.account.id);
      else await updateBankAccount(confirm.account.id, { razorpaySettlementTarget: true });
      setNotice({ tone: "success", text: confirm.kind === "deactivate" ? "Account deactivated." : "Settlement destination updated." });
      setConfirm(null); await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof Error ? e.message : "Action could not be completed." }); } finally { setBusy(false); }
  }

  return (
    <BankingPageShell title="Bank & Cash Accounts" subtitle="Manage operational bank, cash, and petty cash accounts." actions={<button className={accountingButtonClass()} onClick={() => setShowForm((v) => !v)}>Add Account</button>}>
      {notice ? <AccountingAlert tone={notice.tone}>{notice.text}</AccountingAlert> : null}
      {showForm ? (
        <AccountingSectionCard>
          <AccountingSectionHeader
            title="Add Bank / Cash Account"
            description="Creates the account for banking activity. It does not record an opening balance."
          />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={fieldLabelClass()}>Account name<input className={accountingInputClass()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className={fieldLabelClass()}>Bank name (optional)<input className={accountingInputClass()} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></label>
          <label className={fieldLabelClass()}>Ledger Account code<input className={accountingInputClass()} value={form.glAccountCode} onChange={(e) => setForm({ ...form, glAccountCode: e.target.value })} /></label>
          <label className={fieldLabelClass()}>Type<select className={accountingInputClass()} value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value as typeof form.accountType })}><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="PETTY_CASH">Petty Cash</option></select></label>
          <label className={fieldLabelClass()}>Account number (masked)<input className={accountingInputClass()} placeholder="Last four digits" value={form.maskedAccountNumber} onChange={(e) => setForm({ ...form, maskedAccountNumber: e.target.value })} /></label>
        </div><div className="mt-4 flex gap-2"><button className={accountingButtonClass()} disabled={busy || !form.name.trim() || !form.glAccountCode.trim()} onClick={() => void saveNew()}>Create Account</button><button className={accountingButtonClass("secondary")} onClick={() => setShowForm(false)}>Cancel</button></div>
      </AccountingSectionCard>
      ) : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Accounts"
          description="Book balances reflect your accounting records, not a live bank feed."
        />
        {accounts.length === 0 ? (
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
                  <th className={bankingTh()}>Ledger Account</th>
                  <th className={bankingTh(true)}>Book Balance</th>
                  <th className={bankingTh(true)}>Statement Balance</th>
                  <th className={bankingTh()}>Reconciliation</th>
                  <th className={bankingTh()}>Status</th>
                  <th className={`${bankingTh(true)}`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-[#eee8e0]">
                    <td className={bankingTd()}>
                      {accountDisplayName(a)}
                      {a.bankName ? (
                        <span className="mt-0.5 block text-xs text-[#8a7060]">{a.bankName}</span>
                      ) : null}
                    </td>
                    <td className={bankingTd()}>{accountTypeLabel(a.accountType)}</td>
                    <td className={bankingTd()}>
                      <span className="block text-sm">{a.name}</span>
                      <span className="font-mono text-xs text-[#8a7060]">{a.glAccountCode}</span>
                    </td>
                    <td className={`${bankingTd(true)} ${moneyClass()}`}>
                      {formatInrPaise(a.bookBalanceInPaise)}
                    </td>
                    <td className={`${bankingTd(true)} ${moneyClass()}`}>
                      {a.latestStatementBalanceInPaise != null
                        ? formatInrPaise(a.latestStatementBalanceInPaise)
                        : "—"}
                    </td>
                    <td className={bankingTd()}>
                      {a.reconciliationStatus
                        ? a.reconciliationStatus === "RECONCILED"
                          ? "Reconciled"
                          : "Needs attention"
                        : "Not started"}
                    </td>
                    <td className={bankingTd()}>
                      <AccountingStatusBadge tone={a.isActive ? "success" : "neutral"}>
                        {a.isActive ? "Active" : "Inactive"}
                      </AccountingStatusBadge>
                      {a.razorpaySettlementTarget ? (
                        <span className="ml-1">
                          <AccountingStatusBadge tone="info">Razorpay destination</AccountingStatusBadge>
                        </span>
                      ) : null}
                    </td>
                    <td className={bankingTd(true)}>
                      <AccountRowActions
                        account={a}
                        onEdit={() => setEditing({ ...a })}
                        onSettlement={() => setConfirm({ kind: "settlement", account: a })}
                        onDeactivate={() => setConfirm({ kind: "deactivate", account: a })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BankingTableWrap>
        )}
      </AccountingSectionCard>

      {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5"><h2 className="font-semibold text-[#1c352a]">Edit account details</h2><label className={fieldLabelClass()}>Account name<input className={accountingInputClass()} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label><label className={fieldLabelClass()}>Bank name<input className={accountingInputClass()} value={editing.bankName ?? ""} onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} /></label><div className="flex justify-end gap-2"><button className={accountingButtonClass("secondary")} onClick={() => setEditing(null)}>Cancel</button><button className={accountingButtonClass()} disabled={busy || !editing.name.trim()} onClick={() => void saveEdit()}>Save details</button></div></div></div> : null}
      <AdminConfirmModal
        open={Boolean(confirm)}
        title={confirm?.kind === "deactivate" ? "Deactivate account?" : "Change Razorpay settlement destination?"}
        message={
          confirm?.kind === "deactivate"
            ? "This account will no longer be available for new banking activity. Existing accounting records will remain unchanged."
            : "Future Razorpay settlements will use this destination."
        }
        details={
          confirm
            ? [
                confirm.account.name,
                `Ledger Account ${confirm.account.glAccountCode}`,
                ...(confirm.kind === "deactivate" && confirm.account.razorpaySettlementTarget
                  ? ["This account is currently used as the Razorpay settlement destination."]
                  : [])
              ]
            : undefined
        }
        confirmLabel={confirm?.kind === "deactivate" ? "Deactivate" : "Set destination"}
        danger={confirm?.kind === "deactivate"}
        busy={busy}
        onConfirm={() => void runConfirmed()}
        onClose={() => setConfirm(null)}
      />
    </BankingPageShell>
  );
}
