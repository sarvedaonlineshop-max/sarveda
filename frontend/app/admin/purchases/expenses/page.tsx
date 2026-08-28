"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchExpenses,
  fetchPurchasesVendors,
  formatInrPaise,
  postExpense,
  type ExpenseRow,
  type VendorRow
} from "@/lib/purchases-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingStatusBadge,
  FormSection,
  PurchasesFilterBar,
  PurchasesPageShell,
  PurchasesTableWrap,
  accountingButtonClass,
  accountingInputClass,
  expenseStatusLabel,
  expenseStatusTone,
  fieldLabelClass,
  fmtPurchasesDate,
  moneyClass,
  purchasesTd,
  purchasesTh
} from "@/components/admin/purchases/purchases-ui";

export default function ExpensesPage() {
  const [items, setItems] = useState<ExpenseRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidThrough, setPaidThrough] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchExpenses({ q: q.trim() || undefined });
      setItems(data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [q]);

  useEffect(() => {
    void fetchPurchasesVendors({ activeOnly: true }).then((d) => setVendors(d.items));
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function saveExpense() {
    const amountInPaise = Math.round(parseFloat(amount || "0") * 100);
    if (!account.trim() || amountInPaise <= 0) {
      setErr("Category and amount are required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await postExpense({
        expenseAccount: account.trim(),
        vendorId: vendorId || null,
        amountInPaise,
        paidThrough: paidThrough.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null,
        expenseDate: expenseDate || undefined,
        expenseType: "SERVICES"
      });
      setShowForm(false);
      setAccount("");
      setAmount("");
      setPaidThrough("");
      setInvoiceNumber("");
      setReferenceNumber("");
      setNotes("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PurchasesPageShell
      title="Expenses"
      subtitle="Record and categorize day-to-day business expenses. A purchase order is not required."
      actions={
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className={accountingButtonClass("primary")}
        >
          + Record Expense
        </button>
      }
    >
      <PurchasesFilterBar>
        <label className={fieldLabelClass()}>
          Search
          <input
            className={accountingInputClass()}
            placeholder="Category, vendor, reference…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </PurchasesFilterBar>

      {err ? <AccountingAlert tone="error">{err}</AccountingAlert> : null}

      {showForm ? (
        <div className="space-y-4">
          <FormSection title="Expense Details">
            <label className={fieldLabelClass()}>
              Date
              <input
                type="date"
                className={accountingInputClass()}
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </label>
            <label className={fieldLabelClass()}>
              Amount (₹) *
              <input
                type="number"
                min={0}
                step={0.01}
                className={accountingInputClass()}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </FormSection>
          <FormSection title="Vendor / Payee">
            <label className={`${fieldLabelClass()} sm:col-span-2`}>
              Vendor (optional)
              <select
                className={accountingInputClass()}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">None</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </FormSection>
          <FormSection title="Accounting Category">
            <label className={`${fieldLabelClass()} sm:col-span-2`}>
              Category / expense account *
              <input
                className={accountingInputClass()}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="e.g. Bank Fees, Office Supplies"
              />
            </label>
          </FormSection>
          <FormSection title="Payment">
            <label className={fieldLabelClass()}>
              Payment account
              <input
                className={accountingInputClass()}
                value={paidThrough}
                onChange={(e) => setPaidThrough(e.target.value)}
                placeholder="e.g. ICICI Bank"
              />
            </label>
            <label className={fieldLabelClass()}>
              Invoice / bill #
              <input
                className={accountingInputClass()}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </label>
          </FormSection>
          <FormSection title="Reference / Notes">
            <label className={fieldLabelClass()}>
              Reference
              <input
                className={accountingInputClass()}
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </label>
            <label className={`${fieldLabelClass()} sm:col-span-2`}>
              Notes
              <textarea
                className={`${accountingInputClass()} h-auto min-h-[4rem] py-2`}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </FormSection>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveExpense()}
              className={accountingButtonClass("primary")}
            >
              {busy ? "Saving…" : "Save Expense"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={accountingButtonClass("secondary")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <AccountingEmptyState
          title="No expenses recorded"
          description="Record an operating expense that does not need a purchase order."
        />
      ) : (
        <PurchasesTableWrap>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#e8e2d9]">
                <th className={purchasesTh()}>Date</th>
                <th className={purchasesTh()}>Payee / Vendor</th>
                <th className={purchasesTh()}>Category</th>
                <th className={purchasesTh()}>Reference</th>
                <th className={purchasesTh()}>Payment Account</th>
                <th className={purchasesTh(true)}>Amount</th>
                <th className={purchasesTh()}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="h-11 border-b border-[#f0ece6] last:border-0 hover:bg-[#faf5ec]/70">
                  <td className={purchasesTd()}>{fmtPurchasesDate(e.expenseDate)}</td>
                  <td className={purchasesTd()}>{e.vendor?.name ?? "—"}</td>
                  <td className={`${purchasesTd()} font-medium`}>{e.expenseAccount}</td>
                  <td className={purchasesTd()}>
                    {e.invoiceNumber || e.referenceNumber || "—"}
                  </td>
                  <td className={purchasesTd()}>{e.paidThrough ?? "—"}</td>
                  <td className={`${purchasesTd(true)} ${moneyClass()}`}>
                    {formatInrPaise(e.amountInPaise)}
                  </td>
                  <td className={purchasesTd()}>
                    <AccountingStatusBadge tone={expenseStatusTone(e.status)}>
                      {expenseStatusLabel(e.status)}
                    </AccountingStatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasesTableWrap>
      )}
    </PurchasesPageShell>
  );
}
